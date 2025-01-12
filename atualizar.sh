#!/bin/bash

echo "🔄 Atualizando o projeto..."

# Exclui node_modules antes de atualizar
echo "🧹 Limpando diretórios não rastreados..."
git clean -fd

# Atualiza o repositório
echo "📂 Fazendo pull do repositório remoto..."
git pull origin main || {
    echo "❌ Erro ao fazer pull do repositório. Abortando."
    exit 1
}

# Reinstala dependências
echo "🔧 Instalando dependências..."
npm install || {
    echo "❌ Erro ao instalar dependências. Abortando."
    exit 1
}

echo "✔️ Projeto atualizado com sucesso!"
