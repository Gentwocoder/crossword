from django.shortcuts import render, redirect
from django.http import JsonResponse, Http404
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
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

@ensure_csrf_cookie
def create(request):
    return render(request, 'create.html')

@ensure_csrf_cookie
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
        'start_time': puzzle.start_time.isoformat() if puzzle.status == 'in_progress' and puzzle.start_time else None
    }
    return render(request, 'game.html', context)

@ensure_csrf_cookie
@require_http_methods(['POST'])
@handle_error
def create_puzzle(request):
    try:
        data = json.loads(request.body)
        logger.info(f"Creating puzzle with data: rows={data.get('rows')}, cols={data.get('cols')}, words_count={len(data.get('words', []))}")
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in create_puzzle: {e}")
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    
    rows = data.get('rows')
    cols = data.get('cols')
    words = data.get('words')
    duration = data.get('duration', 30)

    if not all([rows, cols, words]):
        logger.error(f"Missing required fields: rows={rows}, cols={cols}, words={bool(words)}")
        raise ValidationError('Missing required fields')

    # Validate data types and ranges
    try:
        rows = int(rows)
        cols = int(cols)
        duration = int(duration)
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid data types: {e}")
        raise ValidationError('Invalid data types for rows, cols, or duration')

    if not (1 <= rows <= 50 and 1 <= cols <= 50):
        logger.error(f"Grid size out of range: {rows}x{cols}")
        raise ValidationError('Grid size must be between 1x1 and 50x50')

    if len(words) == 0:
        logger.error("No words provided")
        raise ValidationError('At least one word is required')

    # Create puzzle with validation
    try:
        puzzle = CrosswordPuzzle.objects.create(
            rows=rows,
            cols=cols,
            duration=duration,
            status='waiting'
        )
        logger.info(f"Created puzzle with code: {puzzle.code}")
    except Exception as e:
        logger.error(f"Failed to create puzzle: {e}")
        raise ValidationError(f'Failed to create puzzle: {str(e)}')
    
    # Create Word objects with validation
    try:
        for i, word_data in enumerate(words):
            Word.objects.create(
                puzzle=puzzle,
                word=word_data['word'],
                hint=word_data['hint'],
                direction=word_data['direction'],
                start_row=word_data['startRow'],
                start_col=word_data['startCol']
            )
        logger.info(f"Created {len(words)} words for puzzle {puzzle.code}")
    except Exception as e:
        logger.error(f"Failed to create words: {e}")
        # Clean up the puzzle if word creation failed
        puzzle.delete()
        raise ValidationError(f'Failed to create words: {str(e)}')

    return JsonResponse({'code': puzzle.code})

@csrf_exempt  # Temporary for debugging
@require_http_methods(['POST'])
@handle_error
def join_puzzle(request):
    # Add debugging
    logger.info(f"Join puzzle request received. Method: {request.method}")
    logger.info(f"Headers: {dict(request.headers)}")
    
    try:
        data = json.loads(request.body)
        logger.info(f"Request data: {data}")
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    
    code = data.get('code')
    player_name = data.get('display_name')

    if not all([code, player_name]):
        raise ValidationError('Please provide both puzzle code and your name')

    puzzle = CrosswordPuzzle.objects.filter(code=code).first()
    if not puzzle:
        raise Http404('Invalid puzzle code')

    # Prevent joining completed games
    if puzzle.status == 'completed':
        raise ValidationError('This game has already ended')

    if Player.objects.filter(puzzle=puzzle, display_name=player_name).exists():
        raise ValidationError({
            'error': 'This name is already taken in this puzzle',
            'error_type': 'name_taken'
        })

    player = Player.objects.create(
        display_name=player_name,
        puzzle=puzzle
    )
    
    # Only set waiting room timer if the game is still waiting
    if puzzle.status == 'waiting' and not puzzle.waiting_room_start_time:
        puzzle.waiting_room_start_time = timezone.now()
        puzzle.save(update_fields=['waiting_room_start_time'])

    # Set session expiry to puzzle duration plus 10 minutes buffer
    request.session['player_id'] = str(player.id)
    request.session.set_expiry(puzzle.duration * 60 + 600)

    logger.info(f"Player {player_name} successfully joined puzzle {code}")
    return JsonResponse({
        'success': True,
        'player_id': str(player.id),
        'game_status': puzzle.status  # Include game status in response
    })

@require_http_methods(['GET'])
@handle_error
@require_player
def get_puzzle(request, code):
    from django.core.cache import cache
    
    # Try cache first for better performance
    cache_key = f'puzzle_data_{code}'
    cached_data = cache.get(cache_key)
    
    if cached_data:
        # Update player_id for current request
        cached_data['player_id'] = str(request.player.id)
        return JsonResponse(cached_data)
    
    # Optimized query with select_related and prefetch_related
    puzzle = CrosswordPuzzle.objects.select_related().prefetch_related(
        'players',
        'words',
        'solvedword_set__word'
    ).filter(code=code).first()
    
    if not puzzle:
        raise Http404('Puzzle not found')
    
    # Handle waiting room timer logic
    if puzzle.status == 'waiting':
        if not puzzle.waiting_room_start_time:
            puzzle.waiting_room_start_time = timezone.now()
            puzzle.save(update_fields=['waiting_room_start_time'])
        else:
            elapsed = (timezone.now() - puzzle.waiting_room_start_time).total_seconds()
            if elapsed >= 50:
                puzzle.start_game()

    # Mark game as completed if timer has run out
    if puzzle.status == 'in_progress' and puzzle.time_remaining == 0:
        puzzle.end_game()
    
    # Use optimized queries with prefetched data
    players_data = list(puzzle.players.filter(is_active=True).values('id', 'display_name', 'points', 'is_creator'))
    words_data = list(puzzle.words.values('word', 'hint', 'direction', 'start_row', 'start_col'))
    solved_words_data = list(puzzle.solvedword_set.values_list('word__word', flat=True))
    
    response_data = {
        'rows': puzzle.rows,
        'cols': puzzle.cols,
        'words': words_data,
        'status': puzzle.status,
        'duration': puzzle.duration,
        'time_remaining': puzzle.time_remaining,
        'players': players_data,
        'player_id': str(request.player.id),
        'solved_words': solved_words_data,
        'waiting_room_start_time': puzzle.waiting_room_start_time.isoformat() if puzzle.waiting_room_start_time else None
    }
    
    # Cache for 10 seconds (balance between freshness and performance)
    cache.set(cache_key, {k: v for k, v in response_data.items() if k != 'player_id'}, 10)
    
    return JsonResponse(response_data)

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

        # Use select_for_update to prevent race conditions
        puzzle = CrosswordPuzzle.objects.select_for_update().get(code=code)
        
        # Get player info from session
        player_id = request.session.get('player_id')
        if not player_id:
            return JsonResponse({'error': 'Player not found'}, status=404)

        player = Player.objects.select_for_update().get(id=player_id)

        # Check if game is in progress
        if puzzle.status != 'in_progress':
            return JsonResponse({'error': 'Game is not in progress'}, status=400)

        # Check if word is correct and not already solved
        puzzle_word = Word.objects.filter(puzzle=puzzle, word__iexact=word).first()
        if puzzle_word:
            # Check if word was already solved
            already_solved = SolvedWord.objects.filter(puzzle=puzzle, word=puzzle_word).exists()
            if already_solved:
                return JsonResponse({'error': 'Word already solved'}, status=400)
            
            # Create solved word record
            SolvedWord.objects.create(
                puzzle=puzzle,
                word=puzzle_word,
                solved_by=player
            )
            
            # Add points to player
            player.add_points(1)
            
            # Clear cache for this puzzle
            from django.core.cache import cache
            cache.delete(f'puzzle_data_{code}')
            cache.delete(f'leaderboard_{code}')
            
            return JsonResponse({'success': True, 'points': player.points})
        else:
            return JsonResponse({'error': 'Incorrect word'}, status=400)
            
    except CrosswordPuzzle.DoesNotExist:
        return JsonResponse({'error': 'Puzzle not found'}, status=404)
    except Player.DoesNotExist:
        return JsonResponse({'error': 'Player not found'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON data'}, status=400)
    except Exception as e:
        logger.error(f"Error submitting word: {str(e)}", exc_info=True)
        return JsonResponse({'error': 'Internal server error'}, status=500)

@require_http_methods(["GET"])
@rate_limit('get_players', limit=100, period=60)
def get_players(request, code):
    """Get all active players in a puzzle with their scores"""
    try:
        puzzle = CrosswordPuzzle.objects.get(code=code)
        
        # Use simpler, faster query for consistency with leaderboard
        players = puzzle.players.filter(is_active=True).order_by('-points', 'joined_at').values(
            'id', 
            'display_name', 
            'points',
            'is_creator',
            'joined_at'
        )
        
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
    """Optimized leaderboard view with enhanced caching and query performance"""
    from django.core.cache import cache
    
    # Try to get cached leaderboard data first
    cache_key = f'leaderboard_{code}'
    cached_data = cache.get(cache_key)
    
    if not cached_data:
        # Look for puzzle with optimized query
        puzzle = CrosswordPuzzle.objects.select_related().prefetch_related(
            'players__solvedword_set'
        ).filter(code=code).first()
        
        if not puzzle:
            return redirect('home')
        
        # Get all players with their solved words count and timestamps using optimized queries
        players_data = []
        for player in puzzle.players.filter(is_active=True):
            solved_words = player.solvedword_set.filter(puzzle=puzzle)
            points = solved_words.count()
            
            # Get the timestamp of when they reached their current score
            last_solve_time = None
            if solved_words.exists():
                last_solve_time = solved_words.order_by('-timestamp').first().timestamp
            
            players_data.append({
                'name': player.name,
                'points': points,
                'last_solve_time': last_solve_time or player.joined_at,
                'joined_at': player.joined_at
            })
        
        # Sort players: by points descending, then by last solve time ascending (earlier = better)
        players_data.sort(key=lambda x: (-x['points'], x['last_solve_time']))
        
        # Cache the results for 15 seconds to balance freshness with performance
        cached_data = {
            'puzzle': puzzle,
            'players_data': players_data
        }
        cache.set(cache_key, cached_data, 15)
    
    puzzle = cached_data['puzzle']
    players_data = cached_data['players_data']
    
    context = {
        'puzzle': puzzle,
        'puzzle_code': code,
        'players': players_data
    }
    
    # Mark puzzle as inactive instead of deleting it immediately
    # This preserves the data for the leaderboard display
    if puzzle.is_active:
        puzzle.is_active = False
        puzzle.save()
        # Clear cache since puzzle status changed
        cache.delete(cache_key)
    
    return render(request, 'leaderboard.html', context)
