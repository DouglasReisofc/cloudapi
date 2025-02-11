const express = require('express');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec'); // Biblioteca principal para download/extrair informações
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');

// Pasta temporária para armazenar arquivos de conversão
const tmpFolder = './tmp';

// Cria a pasta temporária se não existir
if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
    console.log('📁 Pasta temporária criada:', tmpFolder);
}

// Configurações do Express
const app = express();
const port = 3001;


// Pasta para armazenar arquivos estáticos
const imagesFolder = './images';

// Cria a pasta se não existir
if (!fs.existsSync(imagesFolder)) {
    fs.mkdirSync(imagesFolder);
    console.log('📁 Pasta "images" criada:', imagesFolder);
}

// Função para limpar a pasta "images"
function clearImagesFolder() {
    fs.readdir(imagesFolder, (err, files) => {
        if (err) {
            console.error('❌ Erro ao ler a pasta "images":', err);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(imagesFolder, file);
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error('❌ Erro ao excluir arquivo:', filePath, unlinkErr);
                } else {
                    console.log('🗑️ Arquivo excluído:', filePath);
                }
            });
        });
    });
}

// Servir arquivos estáticos da pasta "images"
app.use('/api/images', express.static(path.join(__dirname, 'images')));


/**
 * Rota para TikTok
 */
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

/**
 * Rota para YouTube (usando youtube-dl-exec)
 * Aceita cookies.txt para casos de restrição/idade.
 */
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ YouTube: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 YouTube: Processando URL:', url);

        // Verifica se existe o arquivo cookies.txt
        const cookiesPath = path.resolve('./cookies.txt');
        if (!fs.existsSync(cookiesPath)) {
            console.warn('⚠️ YouTube: Arquivo cookies.txt não encontrado. Continuando sem cookies...');
        }

        // Obter informações do vídeo
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
            cookies: fs.existsSync(cookiesPath) ? './cookies.txt' : undefined,
            addHeader: [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language: en-US,en;q=0.9',
                'Referer: https://www.youtube.com/',
            ],
        });

        console.log('✔️ YouTube: Dados obtidos:', videoInfo);

        // Filtra o melhor formato MP4
        const videoFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'mp4' &&
                format.acodec !== 'none' &&
                format.vcodec !== 'none' &&
                !format.url.includes('.m3u8')
        );
        // Tenta encontrar MP3 ou áudio puro
        const audioFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'mp3' ||
                (format.acodec !== 'none' && format.vcodec === 'none' && !format.url.includes('.m3u8'))
        );

        // Tamanho aproximado do vídeo (pode ser nulo)
        const videoSize = videoFormat ? (videoFormat.filesize || videoFormat.filesize_approx) : null;

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

app.get('/api/instagram', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Instagram: Processando URL:', url);

        if (url.includes('/stories/')) {
            console.log('🔍 Detectado: Stories');
            return await processStories(url, res);
        } else if (url.includes('/reel/')) {
            console.log('🔍 Detectado: Reels');
            return await processReels(url, res);
        } else if (url.includes('/p/')) {
            console.log('🔍 Detectado: Imagens');
            return await processImages(url, res);
        } else {
            return res.status(400).json({ error: 'Tipo de link desconhecido.' });
        }
    } catch (error) {
        console.error('❌ Instagram: Erro:', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do Instagram.' });
    }
});

/**
 * Processa links de Stories
 */
async function processStories(url, res) {
    const cookiesPath = path.resolve('./instagram.txt');
    const hasCookies = fs.existsSync(cookiesPath);

    try {
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            cookies: hasCookies ? './instagram.txt' : undefined,
            addHeader: [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language: en-US,en;q=0.9',
                'Referer: https://www.instagram.com/',
            ],
            format: 'best[ext=mp4]',
        });

        if (videoInfo._type === 'playlist' && videoInfo.entries) {
            const stories = videoInfo.entries.map((entry) => {
                const bestVideo = entry.formats
                    .filter((fmt) => fmt.ext === 'mp4' && fmt.vcodec !== 'none')
                    .reduce((best, current) => {
                        const bestArea = (best.width || 0) * (best.height || 0);
                        const currentArea = (current.width || 0) * (current.height || 0);
                        return currentArea > bestArea ? current : best;
                    }, {});

                return {
                    id: entry.id,
                    title: entry.title || 'Sem título',
                    duration: entry.duration || null,
                    uploader: entry.uploader || 'Desconhecido',
                    timestamp: entry.timestamp || null,
                    video: bestVideo.url || null,
                    resolution: bestVideo.width && bestVideo.height ? `${bestVideo.width}x${bestVideo.height}` : 'Desconhecida',
                };
            });

            return res.json({
                id: videoInfo.id,
                title: videoInfo.title || 'Stories',
                uploader: videoInfo.uploader || 'Desconhecido',
                stories,
            });
        }

        return res.status(400).json({ error: 'Nenhum stories encontrado.' });
    } catch (error) {
        console.error('❌ Erro ao processar Stories:', error.message);
        throw error;
    }
}

/**
 * Processa links de Reels
 */
async function processReels(url, res) {
    try {
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            addHeader: [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language: en-US,en;q=0.9',
                'Referer: https://www.instagram.com/',
            ],
            format: 'best[ext=mp4]',
        });

        const bestVideo = videoInfo.formats
            .filter((fmt) => fmt.ext === 'mp4' && fmt.vcodec !== 'none')
            .reduce((best, current) => {
                const bestArea = (best.width || 0) * (best.height || 0);
                const currentArea = (current.width || 0) * (current.height || 0);
                return currentArea > bestArea ? current : best;
            }, {});

        return res.json({
            id: videoInfo.id,
            title: videoInfo.title || 'Sem título',
            description: videoInfo.description || 'Sem descrição',
            uploader: videoInfo.uploader || 'Desconhecido',
            like_count: videoInfo.like_count || 0,
            comment_count: videoInfo.comment_count || 0,
            duration: videoInfo.duration || null,
            timestamp: videoInfo.timestamp || null,
            video: bestVideo.url || null,
            resolution: bestVideo.width && bestVideo.height ? `${bestVideo.width}x${bestVideo.height}` : 'Desconhecida',
            thumbnail: videoInfo.thumbnail || null,
        });
    } catch (error) {
        console.error('❌ Erro ao processar Reels:', error.message);
        throw error;
    }
}

async function processImages(url, res) {
    try {
        const browser = await puppeteer.launch({
            executablePath: '/usr/bin/brave-browser', // Caminho do Brave
            headless: true, // Desative o modo headless para ver as ações no navegador
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
            ],
        });

        const page = await browser.newPage();
        await page.goto('https://snapinst.app/pt');
        console.log('🌐 Página acessada com sucesso.');

        await page.waitForSelector('#url');
        await page.type('#url', url);
        console.log('✍️ URL do Instagram preenchida.');

        await new Promise(resolve => setTimeout(resolve, 1000));
        await page.click('.btn.btn-paste');
        console.log('✅ Botão "Paste" clicado.');

        await new Promise(resolve => setTimeout(resolve, 1000));
        await page.click('.btn.btn-get');
        console.log('✅ Botão "Download" clicado.');

        await new Promise(resolve => setTimeout(resolve, 5000));
        const modalSelector = '.modal-content';
        const modalExists = await page.$(modalSelector);
        if (modalExists) {
            const closeModalSelector = '#close-modal';
            await page.click(closeModalSelector);
            console.log('🛠️ Modal detectado e fechado.');
        } else {
            console.log('🛠️ Nenhum modal detectado, prosseguindo.');
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
        const containerSelector = '.container .download';
        const containerExists = await page.$(containerSelector);

        if (containerExists) {
            const downloadLinks = await page.$$eval(`${containerSelector} a`, (links) =>
                links.map((link) => link.href)
            );

            console.log('📥 Links de download encontrados:', downloadLinks);

            // Pasta para salvar imagens
            const outputDir = './images';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir);
                console.log(`📂 Pasta criada: ${outputDir}`);
            }

            // Função para baixar uma imagem usando axios
            const downloadImage = async (url) => {
                const uniqueName = `${uuidv4()}.jpg`; // Nome único aleatório com extensão .jpg
                const filepath = path.join(outputDir, uniqueName);
                const response = await axios({
                    url,
                    method: 'GET',
                    responseType: 'stream',
                });
                const writer = fs.createWriteStream(filepath);
                response.data.pipe(writer);
                return new Promise((resolve, reject) => {
                    writer.on('finish', () => resolve(uniqueName));
                    writer.on('error', reject);
                });
            };

            // Baixar todas as imagens e armazenar os caminhos completos
            const imageUrls = [];
            for (const link of downloadLinks) {
                console.log(`⬇️ Baixando imagem: ${link}`);
                const uniqueName = await downloadImage(link);
                const fullUrl = `https://fitting-highly-husky.ngrok-free.app/api/images/${uniqueName}`;
                imageUrls.push(fullUrl);
                console.log(`✅ Imagem salva e disponível em: ${fullUrl}`);
            }

            console.log('✅ Todas as imagens foram baixadas.');
            await browser.close();

            // Resposta JSON incluindo os links completos
            return res.json({
                type: 'images',
                url,
                images: imageUrls,
            });
        } else {
            console.log('❌ Nenhum link de download encontrado.');
            await browser.close();
            return res.status(404).json({ error: 'Nenhuma imagem encontrada.' });
        }
    } catch (error) {
        console.error('❌ Erro ao processar Imagens:', error.message);
        throw error;
    }
}
/**
 * Rota para Kwai
 */
app.get('/api/kwai', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ Kwai: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Kwai: Processando URL:', url);

        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'best[ext=mp4]',
        });

        console.log('✔️ Kwai: Dados obtidos:', videoInfo);

        const title = videoInfo.title || '';
        const uploaderName = title.split('(')[0].trim();
        const uploaderHandle = title.match(/\((.*?)\)/)?.[1] || 'Desconhecido';

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

/**
 * Rota para Facebook
 */
app.get('/api/facebook', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ Facebook: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Facebook: Processando URL:', url);

        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
        });

        console.log('✔️ Facebook: Dados obtidos:', videoInfo);

        const videoFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'mp4' &&
                format.acodec !== 'none' &&
                format.vcodec !== 'none' &&
                !format.url.includes('.m3u8')
        );
        const audioFormat = videoInfo.formats.find(
            (format) =>
                format.ext === 'm4a' ||
                (format.acodec !== 'none' && format.vcodec === 'none' && !format.url.includes('.m3u8'))
        );

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

/**
 * Rota para Pinterest
 */
app.get('/api/pinterest', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        console.error('❌ Pinterest: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log('🔄 Pinterest: Processando URL:', url);

        // Primeiro, tenta extrair vídeo via youtubedl
        let videoInfo;
        try {
            videoInfo = await youtubedl(url, {
                dumpSingleJson: true,
                format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
            });

            console.log('✔️ Pinterest: Dados de vídeo obtidos (yt-dlp):', videoInfo);

            const videoFormat = videoInfo.formats.find(
                (format) =>
                    format.ext === 'mp4' &&
                    format.acodec !== 'none' &&
                    format.vcodec !== 'none' &&
                    !format.url.includes('.m3u8')
            );

            // Se encontrou vídeo, retorna
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
            console.warn('❌ Pinterest: Falha ao obter vídeo. Tentando buscar imagens...', error.message);
        }

        // Caso não seja vídeo, faz scraping de imagens
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

        // Filtra imagens pequenas
        const minSize = 200;
        imageUrls = imageUrls.filter((imgUrl) => {
            const match = imgUrl.match(/\/(\d{2,4})x(\d{2,4})\//);
            if (match) {
                const width = parseInt(match[1], 10);
                const height = parseInt(match[2], 10);
                return width >= minSize && height >= minSize;
            }
            return true;
        });

        if (!imageUrls.length) {
            console.warn('⚠️ Pinterest: Todas as imagens filtradas eram muito pequenas.');
            imageUrls = Array.from(document.querySelectorAll('img[src]')).map((img) => img.src);
        }

        // Ordena por resolução (maior para menor)
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

        console.log('✔️ Pinterest: Dados de imagem formatados:', formattedImageData);
        return res.json(formattedImageData);
    } catch (error) {
        console.error('❌ Pinterest: Erro ao processar o link.', error.message);
        return res.status(500).json({ error: 'Erro ao processar o link do Pinterest.' });
    }
});

/**
 * Rota genérica para outras plataformas (Twitter, etc.)
 */
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

/**
 * Função para limpar arquivos antigos (mais de 10 minutos)
 */
const cleanupTempFiles = () => {
    fs.readdir(tmpFolder, (err, folders) => {
        if (err) return console.error('❌ Erro ao listar diretórios temporários:', err);

        const now = Date.now();

        folders.forEach((folder) => {
            const folderPath = path.join(tmpFolder, folder);

            fs.readdir(folderPath, (err, files) => {
                if (err) {
                    // Se não for pasta
                    if (err.code === 'ENOTDIR') {
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

                        // Se o arquivo for mais antigo que 10 minutos
                        if (now - stats.mtimeMs > 10 * 60 * 1000) {
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
// Executa a limpeza a cada 10 minutos
setInterval(cleanupTempFiles, 10 * 60 * 1000);

/**
 * Rota para conversão (bitrate reduzido, usando youtube-dl-exec + cookies)
 */
app.get('/api/convert/:userId', async (req, res) => {
    const { userId } = req.params;
    const { url, format = 'mp3' } = req.query;

    if (!url) {
        console.error('❌ Conversão: URL não fornecida.');
        return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
    }

    try {
        console.log(`🔄 Conversão: Processando URL para ${format}:`, url);

        const cookiesPath = path.resolve('./cookies.txt');
        if (!fs.existsSync(cookiesPath)) {
            console.warn('⚠️ Conversão: Arquivo cookies.txt não encontrado. Continuando sem cookies...');
        }

        // Obter URL de áudio
        const videoInfo = await youtubedl(url, {
            dumpSingleJson: true,
            format: 'bestaudio/best',
            cookies: fs.existsSync(cookiesPath) ? './cookies.txt' : undefined,
            addHeader: [
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept-Language: en-US,en;q=0.9',
            ],
        });

        const audioUrl = videoInfo.url;
        if (!audioUrl) {
            console.error('❌ Conversão: Não foi possível obter a URL do áudio.');
            return res.status(500).json({ error: 'Não foi possível obter a URL do áudio.' });
        }
        console.log('✔️ URL de áudio direto obtida:', audioUrl);

        // Cria pasta do usuário, se não existir
        const userFolder = path.join(tmpFolder, userId);
        if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder);

        // Caminho de saída do arquivo convertido
        const tempFilePath = path.join(userFolder, `converted.${format}`);

        console.log('🔄 Executando conversão com ffmpeg (64kbps)...');
        const command = [
            'ffmpeg',
            '-y', // sobrescreve se já existir
            '-i', audioUrl,
            '-codec:a', format === 'mp3' ? 'libmp3lame' : 'aac',
            '-b:a', '64k',
            '-ac', '2',
            '-ar', '44100',
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

// Rota para servir arquivos temporários após a conversão
app.use('/:userId', express.static(tmpFolder));

// Inicia o servidor
app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);

    // Agenda a limpeza da pasta "images" a cada 5 minutos
    setInterval(clearImagesFolder, 5 * 60 * 1000); // 5 minutos em milissegundos
    console.log('⏲️ Limpeza automática da pasta "images" configurada para cada 5 minutos.');
});
