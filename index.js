const express = require('express');
const { exec, spawn } = require('child_process'); // Para executar comandos do FFmpeg (exec/spawn)
const dns = require('dns');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const tmpFolder = './tmp';

if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
    console.log('📁 Pasta temporária criada:', tmpFolder);
}

// Configurações do Express
const app = express();
const port = 3000;

// Rota para TikTok
app.get('/api/tiktok', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ TikTok: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 TikTok: Processando URL:', url);
        const apiUrl = `https://www.tikwm.com/api/?url=${url}`;
        const response = await axios.get(apiUrl);

        if (response.data && response.data.data) {
            console.log('✔️ TikTok: Dados obtidos:', response.data.data);
            return res.json(response.data.data);
        } else {
            console.error('❌ TikTok: Erro ao obter dados do vídeo.');
            return res.status(500).json({ error: 'Erro ao obter dados do vídeo.' });
        }
    } catch (error) {
        console.error('❌ TikTok: Erro:', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do TikTok.' });
    }
});

// Rota para YouTube
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ YouTube: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 YouTube: Processando URL:', url);

        // Configurar servidores DNS personalizados
        dns.setServers(['1.1.1.1', '8.8.8.8']); // Cloudflare e Google DNS
        console.log('✔️ DNS: Resolvers configurados para 1.1.1.1 e 8.8.8.8');

        // Testar resolução DNS
        dns.lookup('youtube.com', (err, address, family) => {
            if (err) {
                console.error('❌ DNS: Falha ao resolver youtube.com', err.message);
                return res.status(500).json({ error: 'Falha na resolução de DNS.' });
            } else {
                console.log(`✔️ DNS: Resolução bem-sucedida - ${address}, IPv${family}`);
            }
        });

        // Obter informações detalhadas do vídeo com cabeçalhos e cookies
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]', // Prioriza MP4 com áudio embutido
            cookies: './cookies.txt', // Caminho para o arquivo de cookies
            addHeader: [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language: en-US,en;q=0.9',
                'Referer: https://www.youtube.com/',
            ],
        });

        console.log('✔️ YouTube: Dados obtidos:', videoInfo);

        // Filtrar o melhor formato MP4 com áudio e vídeo integrados
        const videoFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'mp4' &&
                format.acodec !== 'none' &&
                format.vcodec !== 'none' &&
                !format.url.includes('.m3u8')
        );

        // Filtrar o melhor formato MP3 ou equivalente em áudio puro
        const audioFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'mp3' ||
                (format.acodec !== 'none' && format.vcodec === 'none' && !format.url.includes('.m3u8'))
        );

        // Extrair o tamanho aproximado do vídeo
        const videoSize = videoFormat ? videoFormat.filesize || videoFormat.filesize_approx : null;

        // Formatar a resposta
        const formattedData = {
            title: videoInfo.title || 'Título não disponível',
            duration: videoInfo.duration
                ? `${Math.floor(videoInfo.duration / 60)} min ${videoInfo.duration % 60} sec`
                : 'Duração não disponível',
            uploader: videoInfo.uploader || 'Uploader desconhecido',
            views: videoInfo.view_count || 'N/A',
            thumbnail: videoInfo.thumbnail || '',
            mp4_link: videoFormat ? videoFormat.url : 'MP4 não disponível',
            mp3_link: audioFormat ? audioFormat.url : 'MP3 não disponível',
            filesize: videoSize,
        };

        console.log('✔️ YouTube: Dados formatados:', formattedData);

        return res.json(formattedData);
    } catch (error) {
        console.error('❌ YouTube: Erro:', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do YouTube.' });
    }
});

// Rota para Kwai
app.get('/api/kwai', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ Kwai: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Kwai: Processando URL:', url);

        // Obter informações detalhadas do vídeo
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'best[ext=mp4]',
        });

        console.log('✔️ Kwai: Dados obtidos:', videoInfo);

        // Separar nome do criador e handle (dentro dos parênteses)
        const title = videoInfo.title || '';
        const uploaderName = title.split('(')[0].trim(); // Nome antes dos parênteses
        const uploaderHandle = title.match(/\((.*?)\)/)?.[1] || 'Desconhecido'; // Nome dentro dos parênteses

        // Formatar a resposta
        const formattedData = {
            id: videoInfo.id || 'ID não disponível',
            title: videoInfo.title || 'Título não disponível',
            description: videoInfo.description || 'Descrição não disponível',
            duration: videoInfo.duration
                ? `${Math.floor(videoInfo.duration / 60)} min ${videoInfo.duration % 60} sec`
                : 'Duração não disponível',
            uploader: uploaderName || 'Uploader desconhecido',
            uploader_handle: `@${uploaderHandle}`,
            view_count: videoInfo.view_count || 0,
            like_count: videoInfo.like_count || 0,
            thumbnail: videoInfo.thumbnail || '',
            video_url: videoInfo.url || 'MP4 não disponível',
            webpage_url: videoInfo.webpage_url || url,
        };

        console.log('✔️ Kwai: Dados formatados:', formattedData);

        return res.json(formattedData);
    } catch (error) {
        console.error('❌ Kwai: Erro:', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do Kwai.' });
    }
});

// Rota para Facebook
app.get('/api/facebook', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ Facebook: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Facebook: Processando URL:', url);

        // Obter informações detalhadas do vídeo
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
        });

        console.log('✔️ Facebook: Dados obtidos:', videoInfo);

        // Filtrar o melhor formato MP4 com áudio e vídeo integrados
        const videoFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'mp4' &&
                format.acodec !== 'none' &&
                format.vcodec !== 'none' &&
                !format.url.includes('.m3u8')
        );

        // Filtrar o melhor formato de áudio
        const audioFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'm4a' ||
                (format.acodec !== 'none' && format.vcodec === 'none' && !format.url.includes('.m3u8'))
        );

        // Formatar a resposta
        const formattedData = {
            id: videoInfo.id || 'ID não disponível',
            title: videoInfo.title || 'Título não disponível',
            description: videoInfo.description || 'Descrição não disponível',
            duration: videoInfo.duration
                ? `${Math.floor(videoInfo.duration / 60)} min ${Math.round(videoInfo.duration % 60)} sec`
                : 'Duração não disponível',
            uploader: videoInfo.uploader || 'Uploader desconhecido',
            thumbnail: videoInfo.thumbnail || '',
            mp4_link: videoFormat ? videoFormat.url : 'MP4 não disponível',
            mp3_link: audioFormat ? audioFormat.url : 'MP3 não disponível',
            view_count: videoInfo.view_count || 'N/A',
        };

        console.log('✔️ Facebook: Dados formatados:', formattedData);

        return res.json(formattedData);
    } catch (error) {
        console.error('❌ Facebook: Erro:', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do Facebook.' });
    }
});

// Rota para Pinterest
app.get('/api/pinterest', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ Pinterest: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Pinterest: Processando URL:', url);

        // Tentar obter informações do vídeo com yt-dlp
        let videoInfo;
        try {
            videoInfo = await youtubedl(url, {
                dumpSingleJson: true,
                format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
            });

            console.log('✔️ Pinterest: Dados de vídeo obtidos via yt-dlp:', videoInfo);

            const videoFormat = videoInfo.formats.find(
                (format) =>
                    format.ext === 'mp4' &&
                    format.acodec !== 'none' &&
                    format.vcodec !== 'none' &&
                    !format.url.includes('.m3u8')
            );

            const formattedVideoData = {
                title: videoInfo.title || 'Título não disponível',
                description: videoInfo.description || 'Descrição não disponível',
                duration: videoInfo.duration
                    ? `${Math.floor(videoInfo.duration / 60)} min ${videoInfo.duration % 60} sec`
                    : 'Duração não disponível',
                uploader: videoInfo.uploader || 'Uploader desconhecido',
                thumbnail: videoInfo.thumbnail || '',
                mp4_link: videoFormat ? videoFormat.url : 'MP4 não disponível',
            };

            return res.json(formattedVideoData);
        } catch (error) {
            console.warn(
                '❌ Pinterest: Falha ao obter dados do vídeo com yt-dlp. Tentando buscar imagens...',
                error.message
            );
        }

        // Caso yt-dlp não retorne dados, buscar imagens via scraping
        const response = await axios.get(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            },
        });

        const dom = new JSDOM(response.data);
        const document = dom.window.document;

        let imageUrls = Array.from(document.querySelectorAll('img[src]')).map((img) => img.src);

        if (!imageUrls.length) {
            console.error('❌ Pinterest: Nenhuma imagem encontrada.');
            return res.status(500).json({ error: 'Nenhuma mídia encontrada.' });
        }

        // Filtrar imagens muito pequenas (largura ou altura < 200px), exceto se forem as únicas
        const minSize = 200;
        imageUrls = imageUrls.filter((url) => {
            const match = url.match(/\/(\d{2,4})x(\d{2,4})\//);
            if (match) {
                const width = parseInt(match[1], 10);
                const height = parseInt(match[2], 10);
                return width >= minSize && height >= minSize;
            }
            return true; // Manter URLs que não têm dimensões na URL
        });

        // Garantir que ao menos uma imagem seja mantida
        if (!imageUrls.length) {
            console.warn('⚠️ Pinterest: Todas as imagens filtradas eram muito pequenas.');
            imageUrls = Array.from(document.querySelectorAll('img[src]')).map((img) => img.src);
        }

        // Ordenar imagens por resolução
        imageUrls.sort((a, b) => {
            const getRes = (url) => {
                const match = url.match(/\/(\d{2,4})x(\d{2,4})\//);
                if (match) {
                    return parseInt(match[1], 10) * parseInt(match[2], 10);
                }
                return 0;
            };
            return getRes(b) - getRes(a);
        });

        const formattedImageData = {
            title: 'Imagem do Pinterest',
            description: 'Imagem obtida do Pinterest',
            thumbnail: imageUrls[0],
            image_links: imageUrls,
        };

        console.log('✔️ Pinterest: Dados de imagem formatados  :', formattedImageData);

        return res.json(formattedImageData);
    } catch (error) {
        console.error('❌ Pinterest: Erro ao processar o link.', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do Pinterest.' });
    }
});

// Rota genérica para outros serviços (Instagram, Twitter, etc.)
app.get('/api/others', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ Genérica: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Genérica: Processando URL:', url);
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'best[ext=mp4]',
        });

        console.log('✔️ Genérica: Dados obtidos:', videoInfo);
        return res.json(videoInfo);
    } catch (error) {
        console.error('❌ Genérica: Erro:', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link.' });
    }
});

// Função para limpar arquivos antigos
const cleanupTempFiles = () => {
    fs.readdir(tmpFolder, (err, folders) => {
        if (err) return console.error('❌ Erro ao listar diretórios temporários:', err);

        const now = Date.now();

        folders.forEach((folder) => {
            const folderPath = path.join(tmpFolder, folder);

            fs.readdir(folderPath, (err, files) => {
                if (err) {
                    if (err.code === 'ENOTDIR') {
                        // Caso encontre um arquivo em vez de pasta, tenta remover
                        fs.unlink(folderPath, (unlinkErr) => {
                            if (!unlinkErr) console.log('🗑️ Arquivo órfão removido:', folderPath);
                        });
                        return;
                    }
                    return console.error('❌ Erro ao listar arquivos da pasta:', err);
                }

                files.forEach((file) => {
                    const filePath = path.join(folderPath, file);
                    fs.stat(filePath, (err, stats) => {
                        if (err) return console.error('❌ Erro ao obter informações do arquivo:', err);
                        if (now - stats.mtimeMs > 10 * 60 * 1000) {
                            // Arquivos mais antigos que 10 minutos
                            fs.unlink(filePath, (err) => {
                                if (err) return console.error('❌ Erro ao remover arquivo temporário:', err);
                                console.log('🗑️ Arquivo temporário removido:', filePath);
                            });
                        }
                    });
                });
            });
        });
    });
};

// Limpar arquivos antigos a cada 10 minutos
setInterval(cleanupTempFiles, 10 * 60 * 1000);

// Rota para conversão
app.get('/api/convert/:userId', async (req, res) => {
    const { userId } = req.params;
    const { url, format = 'mp3' } = req.query;

    if (!url) {
        console.error('❌ Conversão: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log(`🔄 Conversão: Processando URL para ${format}:`, url);

        // Configurar servidores DNS personalizados
        dns.setServers(['1.1.1.1', '8.8.8.8']); // Cloudflare e Google DNS
        console.log('✔️ DNS: Resolvers configurados para 1.1.1.1 e 8.8.8.8');

        // Verificar cookies
        const cookiesPath = path.resolve('./cookies.txt');
        if (!fs.existsSync(cookiesPath)) {
            console.error('❌ Cookies: Arquivo cookies.txt não encontrado.');
            return res.status(500).json({ error: 'Arquivo de cookies não encontrado.' });
        }
        console.log('✔️ Cookies: Arquivo de cookies carregado.');

        // Obter informações do vídeo
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'bestaudio/best',
            cookies: cookiesPath,
            addHeader: [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language: en-US,en;q=0.9',
            ],
        });

        const audioUrl = videoInfo.url;
        if (!audioUrl) {
            console.error('❌ Conversão: Não foi possível obter a URL do áudio.');
            return res.status(500).json({ error: 'Não foi possível obter a URL do áudio.' });
        }
        console.log('✔️ URL de áudio direto obtida:', audioUrl);

        // Caminho para o arquivo convertido
        const userFolder = path.join(tmpFolder, userId);
        if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder);

        const tempFilePath = path.join(userFolder, `converted.${format}`);

        // Executar a conversão com ffmpeg
        console.log('🔄 Executando conversão com ffmpeg...');
        const command = [
            'ffmpeg',
            '-i',
            audioUrl,
            '-codec:a',
            format === 'mp3' ? 'libmp3lame' : 'aac',
            '-q:a',
            '2',
            tempFilePath,
        ];

        const process = spawn(command[0], command.slice(1));

        process.stderr.on('data', (data) => {
            console.error(`⚠️ ffmpeg STDERR: ${data}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                console.log('✔️ Conversão concluída com sucesso:', tempFilePath);
                const fileUrl = `${req.protocol}://${req.get('host')}/${userId}/converted.${format}`;
                return res.json({ audioUrl: fileUrl });
            } else {
                console.error('❌ Conversão: Processo de conversão falhou com código:', code);
                return res.status(500).json({ error: 'Falha no processo de conversão com ffmpeg.' });
            }
        });
    } catch (error) {
        console.error('❌ Conversão: Erro inesperado.', error.message);
        return res.status(500).json({ error: 'Erro inesperado durante a conversão.' });
    }
});

// Rota para servir arquivos temporários
app.use('/:userId', express.static(tmpFolder));

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
