#!/bin/bash

echo "🔄 Iniciando processo de atualização do repositório..."

# Certifique-se de que não há alterações não confirmadas
echo "✔️ Limpando alterações locais..."
git reset --hard HEAD

# Verificar e salvar mudanças locais (stash), se necessário
echo "✔️ Verificando alterações locais..."
if [ -n "$(git status --porcelain)" ]; then
    echo "🔄 Salvando mudanças locais temporariamente (stash)..."
    git stash
fi

# Atualizar o repositório
echo "🔄 Atualizando repositório com git pull..."
git pull origin main

if [ $? -eq 0 ]; then
    echo "✔️ Atualização concluída com sucesso!"
else
    echo "❌ Erro: Falha ao atualizar o repositório."
    exit 1
fi

# Restaurar alterações guardadas (se houver)
if git stash list | grep -q "stash@{0}"; then
    echo "🔄 Restaurando mudanças locais guardadas..."
    git stash pop
fi

# Instalar dependências do Node.js, se necessário
if [ -f "package.json" ]; then
    echo "🔄 Instalando dependências do Node.js..."
    npm install
    if [ $? -eq 0 ]; then
        echo "✔️ Dependências instaladas com sucesso!"
    else
        echo "❌ Erro: Falha ao instalar dependências."
        exit 1
    fi
fi

# Reiniciar o servidor com PM2
echo "🔄 Reiniciando servidor Node.js com PM2..."
pm2 restart all

if [ $? -eq 0 ]; then
    echo "✔️ Servidor reiniciado com sucesso!"
else
    echo "❌ Erro: Falha ao reiniciar o servidor."
    exit 1
fi

echo "🚀 Atualização completa!"
