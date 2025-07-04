# Generated by Django 5.2.3 on 2025-06-15 14:25

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crossword', '0003_player_correct_words_alter_crosswordpuzzle_cols_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='SolvedWord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('solved_at', models.DateTimeField(auto_now_add=True)),
                ('puzzle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='solved_words', to='crossword.crosswordpuzzle')),
                ('solved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='crossword.player')),
                ('word', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='crossword.word')),
            ],
            options={
                'unique_together': {('puzzle', 'word')},
            },
        ),
    ]
