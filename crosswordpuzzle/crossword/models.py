from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.core.exceptions import ValidationError
import uuid
from django.utils import timezone
import re

def generate_code():
    return str(uuid.uuid4())[:8]

class CrosswordPuzzleManager(models.Manager):
    def active_puzzles(self):
        return self.filter(is_active=True)
        
    def get_by_code(self, code):
        return self.get(code=code, is_active=True)
        
    def cleanup_old_puzzles(self, days=7):
        cutoff_date = timezone.now() - timezone.timedelta(days=days)
        self.filter(created_at__lt=cutoff_date, status='completed').update(is_active=False)

class CrosswordPuzzle(models.Model):
    STATUS_CHOICES = [
        ('waiting', 'Waiting for Players'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed')
    ]

    MAX_ROWS = 50
    MAX_COLS = 50
    MIN_DURATION = 5
    MAX_DURATION = 120
    MIN_WORDS = 1

    code = models.CharField(max_length=8, unique=True, default=generate_code)
    rows = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(MAX_ROWS)],
        help_text=f"Number of rows (max {MAX_ROWS})"
    )
    cols = models.IntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(MAX_COLS)],
        help_text=f"Number of columns (max {MAX_COLS})"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    duration = models.IntegerField(
        default=30,
        validators=[MinValueValidator(MIN_DURATION), MaxValueValidator(MAX_DURATION)],
        help_text=f"Duration in minutes (between {MIN_DURATION} and {MAX_DURATION})"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='waiting')
    start_time = models.DateTimeField(null=True, blank=True)
    waiting_room_start_time = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    objects = CrosswordPuzzleManager()

    def clean(self):
        from django.core.exceptions import ValidationError
        # Allow start_time to be set when status is 'waiting' or 'in_progress', but not when 'completed'
        if self.start_time and self.status == 'completed':
            raise ValidationError('Start time cannot be set when game is completed')
        # Validate minimum number of words
        if self.pk and self.words.count() < self.MIN_WORDS:
            raise ValidationError(f'Puzzle must have at least {self.MIN_WORDS} word(s)')

    def save(self, *args, **kwargs):
        self.full_clean()
        if not self.waiting_room_start_time:
            self.waiting_room_start_time = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Puzzle {self.code}"

    def start_game(self):
        if self.status != 'waiting':
            raise ValidationError('Game can only be started from waiting status')
        self.status = 'in_progress'
        self.start_time = timezone.now()
        self.save()

    def end_game(self):
        if self.status != 'in_progress':
            raise ValidationError('Only in-progress games can be ended')
        self.status = 'completed'
        self.start_time = None  # Clear start_time to pass validation
        self.save()

    @property
    def time_remaining(self):
        if not self.start_time or self.status != 'in_progress':
            return None
        elapsed = timezone.now() - self.start_time
        remaining = self.duration * 60 - elapsed.total_seconds()
        return max(0, remaining)

class WordManager(models.Manager):
    def get_unguessed_words(self, puzzle):
        """Get words that haven't been correctly guessed yet"""
        return self.filter(puzzle=puzzle).exclude(
            id__in=puzzle.players.values_list('correct_words', flat=True)
        )

class Word(models.Model):
    DIRECTION_CHOICES = [
        ('across', 'Across'),
        ('down', 'Down')
    ]
    MAX_WORD_LENGTH = 50

    puzzle = models.ForeignKey(CrosswordPuzzle, on_delete=models.CASCADE, related_name='words')
    word = models.CharField(
        max_length=MAX_WORD_LENGTH,
        validators=[
            RegexValidator(
                regex=r'^[A-Za-z]+$',
                message='Word must contain only letters'
            )
        ]
    )
    hint = models.TextField(
        max_length=500,
        help_text='Hint for the word (max 500 characters)'
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    start_row = models.IntegerField()
    start_col = models.IntegerField()

    objects = WordManager()

    def clean(self):
        from django.core.exceptions import ValidationError
        
        if not self.puzzle_id:
            return
            
        # Validate start position is within puzzle bounds
        if self.start_row >= self.puzzle.rows:
            raise ValidationError('Starting row position exceeds puzzle dimensions')
        if self.start_col >= self.puzzle.cols:
            raise ValidationError('Starting column position exceeds puzzle dimensions')
            
        # Validate word fits within puzzle bounds
        if self.direction == 'across' and (self.start_col + len(self.word) > self.puzzle.cols):
            raise ValidationError('Word extends beyond puzzle width')
        if self.direction == 'down' and (self.start_row + len(self.word) > self.puzzle.rows):
            raise ValidationError('Word extends beyond puzzle height')
            
        # Validate word characters
        if not re.match(r'^[A-Za-z]+$', self.word):
            raise ValidationError('Word must contain only letters')

    def save(self, *args, **kwargs):
        self.word = self.word.upper()  # Normalize to uppercase
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.word} ({self.direction})"

class PlayerManager(models.Manager):
    def active_players(self, puzzle):
        return self.filter(puzzle=puzzle, is_active=True)

    def top_players(self, puzzle, limit=10):
        return self.filter(puzzle=puzzle).order_by('-points')[:limit]

class Player(models.Model):
    puzzle = models.ForeignKey(CrosswordPuzzle, on_delete=models.CASCADE, related_name='players')
    display_name = models.CharField(
        max_length=50,
        validators=[
            RegexValidator(
                regex=r'^[\w\s-]+$',
                message='Display name can only contain letters, numbers, spaces, and hyphens'
            )
        ]
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    is_creator = models.BooleanField(default=False)
    points = models.IntegerField(default=0)
    correct_words = models.ManyToManyField(Word, blank=True, related_name='solved_by')

    objects = PlayerManager()

    class Meta:
        unique_together = ['puzzle', 'display_name']

    def __str__(self):
        return f"{self.display_name} in {self.puzzle.code}"

    def add_points(self, points):
        if points < 0:
            raise ValidationError('Cannot add negative points')
        self.points += points
        self.save()

    def mark_word_correct(self, word):
        """Mark a word as correctly guessed by this player"""
        if word.puzzle_id != self.puzzle_id:
            raise ValidationError('Word does not belong to this puzzle')
        self.correct_words.add(word)
        self.add_points(1)

class SolvedWord(models.Model):
    puzzle = models.ForeignKey(CrosswordPuzzle, on_delete=models.CASCADE, related_name='solved_words')
    word = models.ForeignKey(Word, on_delete=models.CASCADE)
    solved_by = models.ForeignKey(Player, on_delete=models.SET_NULL, null=True, blank=True)
    solved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('puzzle', 'word')
