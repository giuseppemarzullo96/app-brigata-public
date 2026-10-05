# Guida Deployment - La Brigata ODV

## Prerequisiti

- Server con Node.js 18+
- PostgreSQL 14+
- Nginx (opzionale, raccomandato)
- SSL Certificate (Let's Encrypt)

## Setup Database

### 1. Creazione Database

```bash
# Connetti a PostgreSQL
psql -U postgres

# Crea database
CREATE DATABASE labrigata_db;

# Crea utente (opzionale)
CREATE USER labrigata_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE labrigata_db TO labrigata_user;
```

### 2. Esecuzione Schema

```bash
# Esegui script SQL schema
psql -U postgres -d labrigata_db -f docs/schema.sql
```

Oppure usa il file `database-schema.md` come riferimento per creare le tabelle.

## Setup Backend

### 1. Installazione Dipendenze

```bash
cd backend
npm install --production
```

### 2. Configurazione

Crea file `.env`:

```bash
NODE_ENV=production
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=labrigata_db
DB_USER=labrigata_user
DB_PASSWORD=secure_password
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://yourdomain.com
```

### 3. Avvio con PM2

```bash
# Installa PM2
npm install -g pm2

# Avvia applicazione
pm2 start src/server.js --name labrigata-backend

# Salva configurazione PM2
pm2 save

# Setup auto-restart
pm2 startup
```

### 4. Reverse Proxy Nginx

Crea `/etc/nginx/sites-available/labrigata`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Abilita sito:
```bash
ln -s /etc/nginx/sites-available/labrigata /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Setup Frontend

### 1. Build Produzione

```bash
cd frontend
npm install
npm run build
```

### 2. Servire con Nginx

Crea `/etc/nginx/sites-available/labrigata-frontend`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /path/to/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
    }
}
```

## SSL/TLS con Let's Encrypt

```bash
# Installa Certbot
sudo apt install certbot python3-certbot-nginx

# Ottieni certificato
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Backup Database

### Script Backup Automatico

Crea `/usr/local/bin/backup-labrigata.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/labrigata"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U labrigata_user labrigata_db | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Mantieni solo ultimi 30 giorni
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

Cron job (giornaliero alle 2 AM):
```bash
0 2 * * * /usr/local/bin/backup-labrigata.sh
```

## Monitoring

### PM2 Monitoring

```bash
pm2 monit
pm2 logs labrigata-backend
```

### Log Rotation

Configura logrotate per `/var/log/labrigata/`:

```bash
/var/log/labrigata/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

## Aggiornamenti

### Processo Deploy

1. **Backup database**
2. **Pull codice aggiornato**
3. **Install dipendenze**: `npm install`
4. **Esegui migrazioni** (se presenti)
5. **Build frontend**: `npm run build`
6. **Restart PM2**: `pm2 restart labrigata-backend`
7. **Verifica**: Controlla log e health endpoint

### Rollback

```bash
# Ripristina backup database
gunzip < backup_YYYYMMDD.sql.gz | psql -U labrigata_user labrigata_db

# Ripristina codice precedente
git checkout <previous-commit>
pm2 restart labrigata-backend
```

## Sicurezza

### Firewall

```bash
# UFW
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Hardening PostgreSQL

- Cambia porta default (5432)
- Configura `pg_hba.conf` per accessi limitati
- Disabilita utente postgres default

### Environment Variables

- Mai committare `.env` in git
- Usa secret manager in produzione (AWS Secrets Manager, etc.)
- Rotazione chiavi JWT periodica

## Performance

### Database Ottimizzazioni

- Connection pooling configurato
- Indici su colonne frequentemente query
- VACUUM periodico

### Caching (Futuro)

- Redis per sessioni
- CDN per assets statici
- Cache API responses

## Troubleshooting

### Log da Controllare

- PM2 logs: `pm2 logs`
- Nginx: `/var/log/nginx/error.log`
- Application: `backend/logs/combined.log`
- Database: PostgreSQL logs

### Health Check

```bash
curl http://localhost:3000/health
```

### Database Connection

```bash
psql -U labrigata_user -d labrigata_db -c "SELECT 1;"
```

## Supporto

Per problemi o domande:
- Controlla log applicazione
- Verifica configurazione `.env`
- Testa connessione database
- Controlla firewall/porte

