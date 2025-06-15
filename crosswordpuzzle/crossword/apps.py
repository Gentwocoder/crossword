from django.apps import AppConfig


class CrosswordConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'crossword'
    verbose_name = 'Crossword Puzzle Game'

    def ready(self):
        """Initialize app-specific configurations"""
        # Import signal handlers
        from . import signals

        # Schedule periodic tasks
        try:
            from django_q.tasks import schedule
            from django_q.models import Schedule
            
            # Schedule cleanup of old puzzles
            if not Schedule.objects.filter(name='cleanup_old_puzzles').exists():
                schedule(
                    'crossword.tasks.cleanup_old_puzzles',
                    name='cleanup_old_puzzles',
                    schedule_type='D'  # Daily
                )
                
            # Schedule inactive player cleanup
            if not Schedule.objects.filter(name='cleanup_inactive_players').exists():
                schedule(
                    'crossword.tasks.cleanup_inactive_players',
                    name='cleanup_inactive_players',
                    schedule_type='H'  # Hourly
                )
        except ImportError:
            # django_q not installed, skip scheduling
            pass
