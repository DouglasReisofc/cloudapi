const express = require('express');
const axios = require('axios');
const youtubedl = require('youtube-dl-exec');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Cria pasta temporária para salvar arquivos
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

      // Obter informações detalhadas do vídeo
      const videoInfo = await youtubedl(url, {
          dumpSingleJson: true,
          format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]', // Prioriza MP4 com áudio embutido
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
      };

      console.log('✔️ YouTube: Dados formatados:', formattedData);

      return res.json(formattedData);
  } catch (error) {
      console.error('❌ YouTube: Erro:', error.message);
      return res.status(500).json({ error: 'Erro ao processar o link do YouTube.' });
  }
});


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
          console.warn('❌ Pinterest: Falha ao obter dados do vídeo com yt-dlp. Tentando buscar imagens...', error.message);
      }

      // Caso yt-dlp não retorne dados, buscar imagens via scraping
      const response = await axios.get(url, {
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
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

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});