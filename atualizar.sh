#!/bin/bash

echo "🔄 Iniciando processo de atualização do repositório..."

# Certifique-se de que o diretório `node_modules` está ignorado no Git
if ! grep -q "node_modules/" .gitignore; then
    echo "✔️ Adicionando node_modules ao .gitignore..."
    echo "node_modules/" >> .gitignore
    git add .gitignore
    git commit -m "Adicionado node_modules ao .gitignore"
fi

# Remove `node_modules` do controle de versão (caso ainda rastreado)
echo "✔️ Removendo node_modules do controle de versão, se necessário..."
git rm -r --cached node_modules/ 2>/dev/null

# Certifique-se de que não há alterações não confirmadas
echo "✔️ Limpando alterações locais (reset para HEAD)..."
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
    echo "🔄 Restaurando mudanças locais guardadas (stash pop)..."
    git stash pop
fi

# Remover node_modules localmente
echo "✔️ Removendo completamente a pasta node_modules..."
rm -rf node_modules

# Instalar dependências do Node.js com --force
if [ -f "package.json" ]; then
    echo "🔄 Instalando dependências do Node.js (forçado)..."
    npm install --force
    if [ $? -eq 0 ]; then
        echo "✔️ Dependências instaladas com sucesso!"
    else
        echo "❌ Erro: Falha ao instalar dependências."
        exit 1
    fi
fi

# Fazer push (caso haja commits gerados acima, ex.: do .gitignore)
echo "🔄 Enviando mudanças locais ao repositório (git push)..."
git push origin main
if [ $? -eq 0 ]; then
    echo "✔️ Mudanças enviadas com sucesso!"
else
    echo "❌ Erro: Falha ao fazer git push."
    exit 1
fi

# Inicia apenas com "node index" (sem PM2)
echo "🚀 Iniciando aplicação com node index..."
node index
