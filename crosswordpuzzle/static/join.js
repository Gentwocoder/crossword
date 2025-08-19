document.addEventListener('DOMContentLoaded', function() {
    const joinForm = document.getElementById('join-form');
    const errorMessage = document.getElementById('error-message');
    const submitButton = joinForm.querySelector('button[type="submit"]');

    joinForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const code = document.getElementById('puzzle-code').value.trim();
        const name = document.getElementById('player-name').value.trim();

        if (!code || !name) {
            showError('Please enter both puzzle code and your name');
            return;
        }

        // Show loading state
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Joining...';
        submitButton.disabled = true;
        hideError();

        // Send join request
        const csrfToken = getCookie('csrftoken');
        console.log('CSRF Token:', csrfToken); // Debug log
        
        fetch('/api/join-puzzle/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            credentials: 'same-origin', // Include cookies
            body: JSON.stringify({
                code: code,
                display_name: name
            })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Failed to join puzzle');
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            // Store player info in session storage
            sessionStorage.setItem('playerId', data.player_id);
            sessionStorage.setItem('playerName', name);
            sessionStorage.setItem('puzzleCode', code);
            
            // Redirect to game page
            window.location.href = `/game/${code}/`;
        })
        .catch(error => {
            showError(error.message || 'Failed to join puzzle');
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        });
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.style.backgroundColor = '#fee2e2';
        errorMessage.style.borderColor = '#ef4444';
        errorMessage.style.color = '#dc2626';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    function getCookie(name) {
        // First try to get from meta tag
        const metaToken = document.querySelector('meta[name="csrf-token"]');
        if (metaToken) {
            return metaToken.getAttribute('content');
        }
        
        // Fallback to cookie method
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
}); 