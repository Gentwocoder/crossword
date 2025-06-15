from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('create/', views.create, name='create'),
    path('join/', views.join, name='join'),
    path('preview/', views.preview_puzzle, name='preview_puzzle'),
    path('game/<str:code>/', views.game, name='game'),
    path('leaderboard/<str:code>/', views.leaderboard, name='leaderboard'),
    
    # API endpoints
    path('api/create-puzzle/', views.create_puzzle, name='create_puzzle'),
    path('api/join-puzzle/', views.join_puzzle, name='join_puzzle'),
    path('api/puzzle/<str:code>/', views.get_puzzle, name='get_puzzle'),
    path('api/puzzle/<str:code>/start/', views.start_game, name='start_game'),
    path('api/puzzle/<str:code>/submit/', views.submit_word, name='submit_word'),
    path('api/puzzle/<str:code>/players/', views.get_players, name='get_players'),
]