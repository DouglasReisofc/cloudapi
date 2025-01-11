const express = require('express');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');

// Cria pasta temporária para salvar arquivos
const tmpFolder = './tmp';
if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
}

// Configurações do Express
const app = express();
const port = 3000;

// Rota para TikTok
app.get('/api/tiktok', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        const apiUrl = `https://www.tikwm.com/api/?url=${url}`;
        const response = await axios.get(apiUrl);

        if (response.data && response.data.data) {
            return res.json(response.data.data); // Retorna todos os dados da API do TikTok
        } else {
            return res.status(500).json({ error: 'Erro ao obter dados do vídeo.' });
        }
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do TikTok.' });
    }
});

// Rota para YouTube
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true, // Retorna todos os dados do vídeo
            format: 'best[ext=mp4]', // Melhor formato disponível em MP4
        });

        return res.json(videoInfo); // Retorna todos os dados da API do YouTube
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do YouTube.' });
    }
});

// Rota para Kwai
app.get('/api/kwai', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        const apiUrl = `https://www.tikwm.com/api/?url=${url}`; // API genérica que funciona com Kwai
        const response = await axios.get(apiUrl);

        if (response.data && response.data.data) {
            return res.json(response.data.data); // Retorna todos os dados da API do Kwai
        } else {
            return res.status(500).json({ error: 'Erro ao obter dados do vídeo.' });
        }
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do Kwai.' });
    }
});

// Rota para Facebook
app.get('/api/facebook', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true, // Retorna todos os dados do vídeo
            format: 'best[ext=mp4]', // Melhor formato disponível
        });

        return res.json(videoInfo); // Retorna todos os dados da API do Facebook
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do Facebook.' });
    }
});

// Rota genérica para outros serviços (Instagram, Twitter, etc.)
app.get('/api/others', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true, // Retorna todos os dados do vídeo
            format: 'best[ext=mp4]', // Melhor formato disponível
        });

        return res.json(videoInfo); // Retorna todos os dados da API genérica
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ error: 'Erro ao processar o link.' });
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
