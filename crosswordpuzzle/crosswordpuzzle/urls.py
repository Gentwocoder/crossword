
from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponseForbidden

def ip_restriction_middleware(get_response):
    def middleware(request):
        allowed_ips = ['10.194.160.32', '192.168.101.237', '10.103.90.2']
        client_ip = request.META.get('REMOTE_ADDR')
        if client_ip not in allowed_ips:
            return HttpResponseForbidden("Access denied")
        return get_response(request)
    return middleware

urlpatterns = [
    path('superadmin/', admin.site.urls),
    path('', include('crossword.urls')),
]
