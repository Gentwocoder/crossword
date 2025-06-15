from django.shortcuts import render, redirect
from django.http import JsonResponse, Http404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from functools import wraps
import json
import logging
import uuid
import datetime
from datetime import timedelta

logger = logging.getLogger(__name__)

from .models import CrosswordPuzzle, Word, Player, SolvedWord

def handle_error(func):
    """Decorator to handle exceptions and return appropriate JSON responses"""
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ValidationError as e:
            logger.warning(f"Validation error in {func.__name__}: {str(e)}")
            return JsonResponse({'error': str(e)}, status=400)
        except Http404 as e:
            logger.warning(f"Not found error in {func.__name__}: {str(e)}")
            return JsonResponse({'error': 'Resource not found'}, status=404)
        except Exception as e:
            logger.error(f"Unexpected error in {func.__name__}: {str(e)}", exc_info=True)
            return JsonResponse(
                {'error': 'An unexpected error occurred'} if settings.DEBUG else {'error': 'Internal server error'},
                status=500
            )
    return wrapper

def require_player(func):
    """Decorator to validate player session"""
    def wrapper(request, *args, **kwargs):
        player_id = request.session.get('player_id')
        if not player_id:
            return JsonResponse({'error': 'Session expired'}, status=401)
        
        player = Player.objects.filter(id=player_id).first()
        if not player:
            return JsonResponse({'error': 'Player not found'}, status=401)
        
        request.player = player
        return func(request, *args, **kwargs)
    return wrapper

def rate_limit(key_prefix, limit=100, period=3600):
    """Rate limiting decorator"""
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            key = f"ratelimit:{key_prefix}:{request.META.get('REMOTE_ADDR', '')}"
            count = cache.get(key, 0)
            if count >= limit:
                return JsonResponse({'error': 'Rate limit exceeded'}, status=429)
            cache.set(key, count + 1, period)
            return view_func(request, *args, **kwargs)
        return _wrapped_view
    return decorator

# Create your views here.
def home(request):
    return render(request, 'index.html')

def create(request):
    return render(request, 'create.html')

def join(request):
    return render(request, 'join.html')

def preview_puzzle(request):
    return render(request, 'preview.html')

def game(request, code):
    puzzle = CrosswordPuzzle.objects.filter(code=code).first()
    if not puzzle:
        return redirect('home')
    
    # Get player info from session
    player_id = request.session.get('player_id')
    if not player_id:
        return redirect('home')
    
    player = Player.objects.filter(id=player_id).first()
    if not player:
        return redirect('home')
    
    # If game is completed, redirect to leaderboard
    if puzzle.status == 'completed':
        return redirect('leaderboard', code=code)
    
    context = {
        'puzzle_code': code,
        'player_name': player.display_name,
        'game_status': puzzle.status,
        'duration': puzzle.duration,
        'start_time': puzzle.start_time.isoformat() if puzzle.start_time else None
    }
    return render(request, 'game.html', context)

@ensure_csrf_cookie
@require_http_methods(['POST'])
@handle_error
def create_puzzle(request):
    data = json.loads(request.body)
    
    rows = data.get('rows')
    cols = data.get('cols')
    words = data.get('words')
    duration = data.get('duration', 30)

    if not all([rows, cols, words]):
        raise ValidationError('Missing required fields')

    # Create puzzle with validation
    puzzle = CrosswordPuzzle.objects.create(
        rows=rows,
        cols=cols,
        duration=duration,
        status='waiting'
    )
    # puzzle.start_time = CrosswordPuzzle.created_at + timedelta(seconds=30)
    # puzzle.save()
    
    # Create Word objects with validation
    for word_data in words:
        Word.objects.create(
            puzzle=puzzle,
            word=word_data['word'],
            hint=word_data['hint'],
            direction=word_data['direction'],
            start_row=word_data['startRow'],
            start_col=word_data['startCol']
        )

    return JsonResponse({'code': puzzle.code})

@ensure_csrf_cookie
@require_http_methods(['POST'])
@handle_error
def join_puzzle(request):
    data = json.loads(request.body)
    
    code = data.get('code')
    player_name = data.get('display_name')

    if not all([code, player_name]):
        raise ValidationError('Please provide both puzzle code and your name')

    puzzle = CrosswordPuzzle.objects.filter(code=code).first()
    if not puzzle:
        raise Http404('Invalid puzzle code')

    if Player.objects.filter(puzzle=puzzle, display_name=player_name).exists():
        raise ValidationError({
            'error': 'This name is already taken in this puzzle',
            'error_type': 'name_taken'
        })

    player = Player.objects.create(
        display_name=player_name,
        puzzle=puzzle
    )

    if puzzle.status == 'waiting' and puzzle.start_time is None:
        puzzle.start_time = timezone.now() + timedelta(seconds=30)
        puzzle.save(update_fields=['start_time'])

    # Set session expiry to puzzle duration plus 10 minutes buffer
    request.session['player_id'] = str(player.id)
    request.session.set_expiry(puzzle.duration * 60 + 600)

    return JsonResponse({
        'success': True,
        'player_id': str(player.id)  # Return the player ID in the response
    })

@require_http_methods(['GET'])
@handle_error
@require_player
def get_puzzle(request, code):
    puzzle = CrosswordPuzzle.objects.filter(code=code).first()
    if not puzzle:
        raise Http404('Puzzle not found')
    # Mark game as completed if timer has run out
    if puzzle.status == 'in_progress' and puzzle.time_remaining == 0:
        puzzle.end_game()
    players = Player.objects.filter(puzzle=puzzle).values('id', 'display_name', 'points')
    words = Word.objects.filter(puzzle=puzzle).values('word', 'hint', 'direction', 'start_row', 'start_col')
    solved_words = list(SolvedWord.objects.filter(puzzle=puzzle).values_list('word__word', flat=True))
    return JsonResponse({
        'rows': puzzle.rows,
        'cols': puzzle.cols,
        'words': list(words),
        'status': puzzle.status,
        'duration': puzzle.duration,
        'time_remaining': puzzle.time_remaining,
        'players': list(players),
        'player_id': str(request.player.id),
        'solved_words': solved_words
    })

@ensure_csrf_cookie
@require_http_methods(['POST'])
@rate_limit('start_game', limit=10, period=60)  # 10 requests per minute
def start_game(request, code):
    try:
        puzzle = CrosswordPuzzle.objects.select_for_update().get(code=code)
        
        # Get player info from session
        player_id = request.session.get('player_id')
        if not player_id:
            return JsonResponse({'error': 'Player not found'}, status=404)

        player = Player.objects.get(id=player_id)

        # Only the first player to join can start the game
        first_player = puzzle.players.order_by('joined_at').first()
        if player.id != first_player.id:
            return JsonResponse({'error': 'Only the first player can start the game'}, status=403)

        # Prevent concurrent game starts
        if puzzle.status != 'waiting':
            return JsonResponse({'error': 'Game already started'}, status=400)

        # Start the game
        puzzle.start_game()
        logger.info(f"Game started: code={code}, start_time={puzzle.start_time}, status={puzzle.status}")
        return JsonResponse({'success': True, 'start_time': str(puzzle.start_time), 'status': puzzle.status})
    except CrosswordPuzzle.DoesNotExist:
        return JsonResponse({'error': 'Puzzle not found'}, status=404)
    except Exception as e:
        logger.error(f"Error starting game: {str(e)}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=400)

@ensure_csrf_cookie
@require_http_methods(['POST'])
@rate_limit('submit_word', limit=50, period=60)  # 50 requests per minute
def submit_word(request, code):
    try:
        data = json.loads(request.body)
        word = data.get('word')
        if not word:
            return JsonResponse({'error': 'Missing word'}, status=400)

        puzzle = CrosswordPuzzle.objects.get(code=code)
        
        # Get player info from session
        player_id = request.session.get('player_id')
        if not player_id:
            return JsonResponse({'error': 'Player not found'}, status=404)

        player = Player.objects.get(id=player_id)

        # Check if game is in progress
        if puzzle.status != 'in_progress':
            return JsonResponse({'error': 'Game is not in progress'}, status=400)

        # Check if word is correct
        puzzle_word = Word.objects.filter(puzzle=puzzle, word__iexact=word).first()
        if puzzle_word:
            # Add point to player
            player.add_points(1)
            return JsonResponse({'success': True, 'points': player.points})
        else:
            return JsonResponse({'error': 'Incorrect word'}, status=400)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        logger.error(f"Error submitting word: {str(e)}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=400)

@require_http_methods(["GET"])
@rate_limit('get_players', limit=100, period=60)
def get_players(request, code):
    """Get all active players in a puzzle with their scores"""
    try:
        puzzle = CrosswordPuzzle.objects.get(code=code)
        players = puzzle.players.filter(is_active=True).values(
            'id', 
            'display_name', 
            'points',
            'is_creator',
            'joined_at'
        ).order_by('-points')
        
        return JsonResponse({
            'players': list(players),
            'total_players': len(players)
        })
    except CrosswordPuzzle.DoesNotExist:
        return JsonResponse({'error': 'Puzzle not found'}, status=404)
    except Exception as e:
        logger.error(f"Error getting players: {str(e)}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=400)

def handle_session_expiry(request, puzzle):
    """Handle expired sessions by marking player as inactive"""
    player_id = request.session.get('player_id')
    if player_id:
        Player.objects.filter(id=player_id).update(is_active=False)
        del request.session['player_id']
    return JsonResponse({'error': 'Session expired'}, status=401)

@require_http_methods(['POST'])
@rate_limit('reconnect', limit=10, period=60)
def reconnect(request, code):
    """Handle player reconnection"""
    try:
        data = json.loads(request.body)
        display_name = data.get('display_name')
        
        if not display_name:
            return JsonResponse({'error': 'Display name is required'}, status=400)
            
        puzzle = CrosswordPuzzle.objects.get(code=code)
        player = puzzle.players.filter(display_name=display_name, is_active=False).first()
        
        if not player:
            return JsonResponse({'error': 'Player not found'}, status=404)
            
        player.is_active = True
        player.save()
        
        request.session['player_id'] = str(player.id)
        request.session.set_expiry(puzzle.duration * 60)
        
        return JsonResponse({
            'success': True,
            'player_id': str(player.id)
        })
    except CrosswordPuzzle.DoesNotExist:
        return JsonResponse({'error': 'Puzzle not found'}, status=404)
    except Exception as e:
        logger.error(f"Error reconnecting: {str(e)}", exc_info=True)
        return JsonResponse({'error': str(e)}, status=400)

def leaderboard(request, code):
    puzzle = CrosswordPuzzle.objects.filter(code=code).first()
    if not puzzle:
        return redirect('home')
    
    # Get all players sorted by points in descending order
    players = puzzle.players.all().order_by('-points')
    
    context = {
        'puzzle_code': code,
        'players': players
    }
    
    # Delete the puzzle after showing the leaderboard
    puzzle.delete()
    
    return render(request, 'leaderboard.html', context)
