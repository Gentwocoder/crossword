from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from django.core.cache import cache
from .models import CrosswordPuzzle, Word, Player
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=CrosswordPuzzle)
def handle_puzzle_save(sender, instance, created, **kwargs):
    """Handle puzzle creation and updates"""
    try:
        # Clear puzzle cache
        cache.delete(f'puzzle:{instance.code}')
        
        # Set first player as creator
        if created:
            logger.info(f"New puzzle created: {instance.code}")
    except Exception as e:
        logger.error(f"Error in handle_puzzle_save: {str(e)}", exc_info=True)

@receiver(post_save, sender=Word)
def handle_word_save(sender, instance, created, **kwargs):
    """Handle word creation and updates"""
    try:
        # Clear puzzle cache
        cache.delete(f'puzzle:{instance.puzzle.code}')
        
        if created:
            logger.info(f"New word added to puzzle {instance.puzzle.code}: {instance.word}")
    except Exception as e:
        logger.error(f"Error in handle_word_save: {str(e)}", exc_info=True)

@receiver(post_save, sender=Player)
def handle_player_save(sender, instance, created, **kwargs):
    """Handle player creation and updates"""
    try:
        # Clear players cache
        cache.delete(f'players:{instance.puzzle.code}')
        
        if created:
            # If this is the first player, mark them as creator
            if not Player.objects.filter(puzzle=instance.puzzle).exclude(id=instance.id).exists():
                instance.is_creator = True
                instance.save()
            logger.info(f"New player {instance.display_name} joined puzzle {instance.puzzle.code}")
    except Exception as e:
        logger.error(f"Error in handle_player_save: {str(e)}", exc_info=True)

@receiver(m2m_changed, sender=Player.correct_words.through)
def handle_correct_word(sender, instance, action, pk_set, **kwargs):
    """Handle when a player correctly guesses a word"""
    try:
        if action == "post_add":
            # Check if all words have been guessed
            puzzle = instance.puzzle
            total_words = Word.objects.filter(puzzle=puzzle).count()
            guessed_words = instance.correct_words.count()
            
            if total_words == guessed_words:
                # This player has won!
                puzzle.end_game()
                logger.info(f"Player {instance.display_name} won puzzle {puzzle.code}")
    except Exception as e:
        logger.error(f"Error in handle_correct_word: {str(e)}", exc_info=True) 