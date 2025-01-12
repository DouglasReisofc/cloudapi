const express = require('express');
const { exec, spawn } = require('child_process');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec'); // Biblioteca principal para download/extrair informações
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Pasta temporária para armazenar arquivos de conversão
const tmpFolder = './tmp';

// Cria a pasta temporária se não existir
if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
    console.log('📁 Pasta temporária criada:', tmpFolder);
}

// Configurações do Express
const app = express();
const port = 3000;

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

/**
 * Rota para Instagram (melhor resolução + informações extras)
 */
app.get('/api/instagram', async (req, res) => {
  const { url } = req.query;

  if (!url) {
      return res.status(400).json({ error: 'O parâmetro "url" é obrigatório.' });
  }

  try {
      console.log('🔄 Instagram: Processando URL:', url);

      // Se tiver cookies do Instagram em 'instagram.txt'
      const cookiesPath = path.resolve('./instagram.txt');
      const hasCookies = fs.existsSync(cookiesPath);

      // Extrai vídeo ou imagem usando youtubedl
      const videoInfo = await youtubedl(url, {
          dumpSingleJson: true,
          cookies: hasCookies ? './instagram.txt' : undefined,
          addHeader: [
              'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept-Language: en-US,en;q=0.9',
              'Referer: https://www.instagram.com/',
          ],
          // Tenta extrair vídeo MP4
          format: 'best[ext=mp4]',
      });

      // Exibe todo o JSON no console (para depuração)
      console.log('🔍 Instagram: JSON completo videoInfo =', JSON.stringify(videoInfo, null, 2));

      // Coletar informações extras (se existirem)
      const {
          id,
          title,
          description,
          like_count,
          comment_count,
          duration,
          uploader,
          channel,
          timestamp
          // ... etc.
      } = videoInfo;

      // Vamos procurar o melhor formato de vídeo (maior resolução)
      const allVideoFormats = (videoInfo.formats || [])
          .filter(fmt => fmt.ext === 'mp4' && fmt.vcodec !== 'none'); 

      let bestFormat = null;
      let bestResolution = 0;
      for (const f of allVideoFormats) {
          const w = f.width || 0;
          const h = f.height || 0;
          const area = w * h;
          if (area > bestResolution) {
              bestResolution = area;
              bestFormat = f;
          }
      }

      // Se encontrou algum formato de vídeo
      if (bestFormat) {
          // Tentar achar áudio (m4a) opcional
          const audioFormat = videoInfo.formats?.find(f => f.ext === 'm4a');

          // Exemplo de retorno com várias infos extras
          return res.json({
              id: id || null,
              title: title || 'Sem Título',
              description: description || 'Sem descrição',
              like_count: like_count ?? 0,
              comment_count: comment_count ?? 0,
              uploader: uploader || 'Desconhecido',
              channel: channel || '',  // ou "Sem canal"
              duration: duration ?? null,
              timestamp: timestamp ?? null,
              mp4_link: bestFormat.url,
              mp3_link: audioFormat?.url || null,
              resolution: bestFormat.width && bestFormat.height
                  ? `${bestFormat.width}x${bestFormat.height}`
                  : 'Desconhecida',
          });
      } else {
          // Caso não tenha vídeo, tentamos extrair imagens
          const imageItems = [];

          // 1) Tenta requested_downloads (às vezes tem .jpg)
          if (videoInfo.requested_downloads) {
              for (const item of videoInfo.requested_downloads) {
                  if (item.ext === 'jpg' || item.ext === 'jpeg') {
                      imageItems.push(item.url);
                  }
              }
          }

          // 2) Se não achou nada, faz scraping manual
          if (!imageItems.length) {
              const resp = await axios.get(url, {
                  headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                  },
              });
              const dom = new JSDOM(resp.data);
              const document = dom.window.document;
              const foundImages = Array.from(document.querySelectorAll('img[src]')).map((img) => img.src);
              imageItems.push(...foundImages);
          }

          if (imageItems.length) {
              // Incluímos também as infos extras (como description, etc.) se quiser
              return res.json({
                  type: 'images',
                  images: imageItems,
                  title: title || 'Post de Imagens',
                  description: description || 'Sem descrição',
                  like_count: like_count ?? 0,
                  comment_count: comment_count ?? 0,
                  uploader: uploader || 'Desconhecido',
                  channel: channel || '',
                  duration: duration ?? null
              });
          }

          // Se nada encontrado
          return res.status(404).json({
              error: 'Não foi possível extrair vídeo ou imagem do Instagram.'
          });
      }
  } catch (error) {
      console.error('❌ Instagram: Erro:', error.message);
      return res.status(500).json({ error: 'Erro ao processar o link do Instagram.' });
  }
});


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
    console.log(`Servidor rodando em http://localhost:${port}`);
});
