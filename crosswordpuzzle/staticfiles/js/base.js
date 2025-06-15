// Handle message dismissal
document.addEventListener('DOMContentLoaded', function() {
    const messages = document.querySelectorAll('.message');
    messages.forEach(message => {
        // Add close button
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        closeButton.className = 'message-close';
        closeButton.style.cssText = `
            float: right;
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0 0.5rem;
            color: inherit;
            opacity: 0.7;
        `;
        closeButton.addEventListener('click', () => {
            message.style.opacity = '0';
            setTimeout(() => message.remove(), 300);
        });
        message.insertBefore(closeButton, message.firstChild);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (message && message.parentNode) {
                message.style.opacity = '0';
                setTimeout(() => message.remove(), 300);
            }
        }, 5000);
    });
});

// Add transition styles to messages
const style = document.createElement('style');
style.textContent = `
    .message {
        transition: opacity 0.3s ease;
    }
`;
document.head.appendChild(style);

// CSRF token handling for AJAX requests
function getCookie(name) {
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

// Add CSRF token to all AJAX requests
const csrftoken = getCookie('csrftoken');
if (csrftoken) {
    document.addEventListener('DOMContentLoaded', function() {
        const xhr = window.XMLHttpRequest;
        const send = xhr.prototype.send;
        xhr.prototype.send = function() {
            this.setRequestHeader('X-CSRFToken', csrftoken);
            return send.apply(this, arguments);
        };
    });
}

// Responsive navigation toggle
document.addEventListener('DOMContentLoaded', function() {
    const nav = document.querySelector('nav');
    const navLinks = document.querySelector('.nav-links');
    
    if (window.innerWidth <= 768) {
        const toggleButton = document.createElement('button');
        toggleButton.className = 'nav-toggle';
        toggleButton.innerHTML = '☰';
        toggleButton.style.cssText = `
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.5rem;
            display: none;
        `;
        
        nav.insertBefore(toggleButton, navLinks);
        
        toggleButton.addEventListener('click', () => {
            navLinks.style.display = navLinks.style.display === 'none' ? 'flex' : 'none';
        });
        
        // Hide nav links initially on mobile
        navLinks.style.display = 'none';
        toggleButton.style.display = 'block';
    }
});

// Add loading indicator for buttons
document.addEventListener('click', function(e) {
    if (e.target.tagName === 'BUTTON' && !e.target.classList.contains('message-close')) {
        const button = e.target;
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = 'Loading...';
        
        // Reset button after 10 seconds (failsafe)
        setTimeout(() => {
            if (button.innerHTML === 'Loading...') {
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }, 10000);
    }
}); 