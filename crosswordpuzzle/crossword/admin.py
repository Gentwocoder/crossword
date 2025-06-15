from django.contrib import admin
from django.utils.html import format_html
from .models import CrosswordPuzzle, Word, Player

@admin.register(CrosswordPuzzle)
class CrosswordPuzzleAdmin(admin.ModelAdmin):
    list_display = ('code', 'status', 'created_at', 'duration', 'is_active', 'player_count')
    list_filter = ('status', 'is_active', 'created_at')
    search_fields = ('code',)
    readonly_fields = ('code', 'created_at')
    
    def player_count(self, obj):
        return obj.players.count()
    player_count.short_description = 'Players'

@admin.register(Word)
class WordAdmin(admin.ModelAdmin):
    list_display = ('word', 'puzzle_code', 'direction', 'position')
    list_filter = ('direction', 'puzzle__status')
    search_fields = ('word', 'hint', 'puzzle__code')
    
    def puzzle_code(self, obj):
        return obj.puzzle.code
    puzzle_code.short_description = 'Puzzle'
    
    def position(self, obj):
        return f"({obj.start_row}, {obj.start_col})"
    position.short_description = 'Position'

@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'puzzle_code', 'points', 'is_active', 'is_creator', 'joined_at')
    list_filter = ('is_active', 'is_creator', 'puzzle__status')
    search_fields = ('display_name', 'puzzle__code')
    readonly_fields = ('joined_at',)
    
    def puzzle_code(self, obj):
        return obj.puzzle.code
    puzzle_code.short_description = 'Puzzle'
