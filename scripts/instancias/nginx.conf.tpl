server {
    server_name __DOMAIN__;
    client_max_body_size 25M;

    root __DIR__/dist;
    index index.html;

    location / {
        # Los archivos del build se sirven directo; la página de la app (en cualquier ruta) la entrega el servidor
        # con el nombre, la descripción y el logo del negocio (vista previa al compartir el enlace por WhatsApp).
        try_files $uri @app;
    }

    location @app {
        # La página principal se revalida siempre: así cada versión nueva llega sin borrar caché
        expires -1;
        add_header Cache-Control "no-cache, must-revalidate" always;
        proxy_pass http://127.0.0.1:__PORT__;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Si el servidor está caído o reiniciando, se entrega el index.html del build tal cual
        proxy_intercept_errors on;
        error_page 502 503 504 =200 /index.html;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:__PORT__/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:__PORT__/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    listen 80;
}
