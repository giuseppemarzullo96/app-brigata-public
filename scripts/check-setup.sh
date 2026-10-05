#!/bin/bash

echo "🔍 Verifica Setup La Brigata ODV"
echo ""

# Verifica backend
echo "📦 Backend:"
if [ -f "backend/.env" ]; then
  echo "  ✅ File .env presente"
else
  echo "  ❌ File .env mancante - esegui: cd backend && npm run configure-env"
fi

if [ -d "backend/node_modules" ]; then
  echo "  ✅ Dipendenze installate"
else
  echo "  ❌ Dipendenze mancanti - esegui: cd backend && npm install"
fi

# Verifica frontend
echo ""
echo "🎨 Frontend:"
if [ -f "frontend/.env" ]; then
  echo "  ✅ File .env presente"
else
  echo "  ❌ File .env mancante"
fi

if [ -d "frontend/node_modules" ]; then
  echo "  ✅ Dipendenze installate"
else
  echo "  ❌ Dipendenze mancanti - esegui: cd frontend && npm install"
fi

# Verifica database
echo ""
echo "🗄️  Database:"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "  ✅ Backend risponde"
  HEALTH=$(curl -s http://localhost:3000/health)
  if echo "$HEALTH" | grep -q "connected"; then
    echo "  ✅ Database connesso"
  else
    echo "  ❌ Database non connesso - verifica credenziali in backend/.env"
  fi
else
  echo "  ⚠️  Backend non raggiungibile (potrebbe non essere avviato)"
fi

# Verifica processi
echo ""
echo "🚀 Processi:"
if lsof -i :3000 > /dev/null 2>&1; then
  echo "  ✅ Backend in esecuzione su porta 3000"
else
  echo "  ⚠️  Backend non in esecuzione - esegui: cd backend && npm run dev"
fi

if lsof -i :3001 > /dev/null 2>&1; then
  echo "  ✅ Frontend in esecuzione su porta 3001"
else
  echo "  ⚠️  Frontend non in esecuzione - esegui: cd frontend && npm run dev"
fi

echo ""
echo "✅ Verifica completata!"

