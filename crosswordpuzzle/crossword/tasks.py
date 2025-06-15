from django.utils import timezone
from datetime import timedelta
from .models import CrosswordPuzzle, Player
import logging

logger = logging.getLogger(__name__)

def cleanup_old_puzzles():
    """Clean up old completed puzzles"""
    try:
        cutoff_date = timezone.now() - timedelta(days=7)
        old_puzzles = CrosswordPuzzle.objects.filter(
            created_at__lt=cutoff_date,
            status='completed'
        )
        count = old_puzzles.update(is_active=False)
        logger.info(f"Deactivated {count} old puzzles")
    except Exception as e:
        logger.error(f"Error in cleanup_old_puzzles: {str(e)}", exc_info=True)

def cleanup_inactive_players():
    """Clean up inactive players from active games"""
    try:
        # Get active puzzles
        active_puzzles = CrosswordPuzzle.objects.filter(
            status='in_progress',
            is_active=True
        )
        
        total_cleaned = 0
        for puzzle in active_puzzles:
            # Calculate session timeout
            timeout = timezone.now() - timedelta(minutes=puzzle.duration)
            
            # Mark players as inactive if they haven't reconnected
            inactive_count = Player.objects.filter(
                puzzle=puzzle,
                is_active=True,
                joined_at__lt=timeout
            ).update(is_active=False)
            
            total_cleaned += inactive_count
            
            # If all players are inactive, end the game
            if not Player.objects.filter(puzzle=puzzle, is_active=True).exists():
                puzzle.end_game()
                logger.info(f"Ended game {puzzle.code} due to all players inactive")
        
        logger.info(f"Cleaned up {total_cleaned} inactive players")
    except Exception as e:
        logger.error(f"Error in cleanup_inactive_players: {str(e)}", exc_info=True)

def end_expired_games():
    """End games that have exceeded their duration"""
    try:
        active_puzzles = CrosswordPuzzle.objects.filter(
            status='in_progress',
            is_active=True
        )
        
        ended_count = 0
        for puzzle in active_puzzles:
            if puzzle.time_remaining == 0:
                puzzle.end_game()
                ended_count += 1
        
        logger.info(f"Ended {ended_count} expired games")
    except Exception as e:
        logger.error(f"Error in end_expired_games: {str(e)}", exc_info=True) 