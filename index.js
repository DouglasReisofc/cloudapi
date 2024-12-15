const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { Pool } = require('pg'); // Importando o Pool do PostgreSQL
const app = express();
const config = require('./dono/config.json'); // Importa o config.json

// Captura o número do dono
const dono = config.numeroDono;
const prefixo = config.prefixo;

// Configuração do body parser para lidar com o corpo das requisições JSON
app.use(bodyParser.json());

// Token de autenticação para a API do WhatsApp
const token = config.token;
const phoneNumberId = config.numberid; // ID do número do WhatsApp Business

// Conexão com o banco de dados PostgreSQLa
const pool = new Pool({
  user: 'postgres',
  host: '5.161.75.202',
  database: 'store',
  password: 'Mfcd62!!Mfcd62!!',
  port: 5432,
});

// Teste de conexão com o banco
pool.connect()
  .then(() => {
    console.log('Conectado ao banco de dados PostgreSQL');
  })
  .catch(err => {
    console.error('Erro ao conectar ao banco de dados:', err);
  });

// Rota GET para verificar o webhook (Meta exige esse método para verificação inicial)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'va1234') {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Erro de verificação');
  }
});

// Rota POST para receber os eventos de mensagens
app.post('/webhook', async (req, res) => {
  try {
    const evento = JSON.stringify(req.body, null, 2);
    const timestamp = new Date().toISOString();
    console.log(`Evento recebido em: ${timestamp}`);
    console.log(evento);

    if (!req.body || !req.body.entry || !req.body.entry[0] || !req.body.entry[0].changes) {
      return res.status(400).send('Evento inválido');
    }

    const entry = req.body.entry[0];
    const message = entry.changes[0]?.value?.messages?.[0];
    const sender = entry.changes[0]?.value?.contacts?.[0]?.wa_id;
    const senderName = entry.changes[0]?.value?.contacts?.[0]?.profile?.name;

    // Confirma o recebimento do webhook logo após validar a requisição
    res.status(200).send('Recebido');

    if (message) {
      // Armazenar o número de WhatsApp e dados do usuário se for a primeira mensagem
      await storeUserData(sender, senderName);

      // Enviar a mensagem inicial com saldo e nome
      if (!message.context) {
        sendMenuInicial(sender, senderName);
      } else if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
        const buttonId = message.interactive.button_reply.id;
        console.log(`Botão clicado: ${buttonId} por ${sender}`);

        switch (buttonId) {
          case 'comprar_conta':
            handleComprarConta(sender);
            break;
          case 'adicionar_saldo':
            handleAdicionarSaldo(sender);
            break;
          case 'suporte':
            handleSuporte(sender);
            break;
          default:
            console.error('Opção não reconhecida');
        }
      }
    } else {
      console.error('Nenhuma mensagem encontrada.');
    }
  } catch (error) {
    console.error('Erro no processamento do evento:', error);
    res.status(500).send('Erro no processamento do evento');
  }
});

async function sendMenuInicial(sender, senderName) {
  const user = await getUserData(sender);
  const saldo = user && !isNaN(user.saldo) ? parseFloat(user.saldo) : 0; // Garantir que saldo seja um número

  const responsePayload = {
    messaging_product: 'whatsapp',
    to: sender,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'image',
        image: {
          link: 'https://i.ibb.co/Xp5xktQ/Picsart-24-11-26-22-38-13-859.jpg' // URL da imagem
        }
      },
      body: {
        text: `
◆ ━━━━❪✪❫━━━━ ◆
𝗠 𝗘 𝗡 𝗨   𝗣 𝗥 𝗜 𝗡 𝗖 𝗜 𝗣𝗔𝗟
乂 Seu número: ${sender}
乂 Saldo Atual: R$: ${saldo.toFixed(2)}
◆ ━━━━❪✪❫━━━━ ◆

💟 𝗦𝗲𝗷𝗮 𝗯𝗲𝗺-𝘃𝗶𝗻𝗱𝗼 𝗮 𝗺𝗲𝗹𝗵𝗼𝗿 𝗹𝗼𝗷𝗮 𝗱𝗲 𝘀𝘁𝗿𝗲𝗮𝗺𝗶𝗻𝗴𝘀 𝗱𝗼 𝗪𝗵𝗮𝘁𝘀𝗮𝗽𝗽 ✨


`
      },
      footer: {
        text: 'Escolha uma das opções abaixo para continuar'
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'comprar_conta',
              title: '🛒 CONTAS DISPONÍVEIS'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'adicionar_saldo',
              title: '❖ ADICIONAR SALDO'
            }
          },
          {
            type: 'reply',
            reply: {
              id: 'suporte',
              title: '📞 SUPORTE'
            }
          }
        ]
      }
    }
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v15.0/${phoneNumberId}/messages`, responsePayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Menu inicial enviado com sucesso:', response.data);
  } catch (error) {
    console.error('Erro ao enviar menu inicial com imagem:', error.response ? error.response.data : error.message);
  }
}


// Função para armazenar os dados do usuário no banco de dados
async function storeUserData(whatsappId, senderName) {
  const client = await pool.connect();
  try {
    // Verificar se o cliente já existe na tabela
    const res = await client.query('SELECT * FROM clientes WHERE whatsapp = $1', [whatsappId]);
    if (res.rows.length === 0) {
      // Caso não exista, cria um novo cliente
      await client.query('INSERT INTO clientes (whatsapp, saldo, criado_em) VALUES ($1, $2, $3)', [whatsappId, 0, new Date()]);
      console.log(`Usuário ${whatsappId} adicionado com sucesso.`);
    } else {
      console.log(`Usuário ${whatsappId} já existe.`);
    }
  } catch (err) {
    console.error('Erro ao armazenar dados do usuário:', err);
  } finally {
    client.release();
  }
}

// Função para obter os dados do usuário do banco de dados
async function getUserData(whatsappId) {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM clientes WHERE whatsapp = $1', [whatsappId]);
    if (res.rows.length > 0) {
      return res.rows[0]; // Retorna os dados do cliente
    } else {
      console.log(`Usuário ${whatsappId} não encontrado.`);
      return null;
    }
  } catch (err) {
    console.error('Erro ao obter dados do usuário:', err);
    return null;
  } finally {
    client.release();
  }
}

// Função para lidar com a escolha "Adicionar Saldo"
async function handleAdicionarSaldo(sender) {
  const user = await getUserData(sender);
  if (user) {
    user.saldo += 10; // Adicionando R$ 10 ao saldo do usuário
    const client = await pool.connect();
    try {
      // Atualiza o saldo do cliente no banco de dados
      await client.query('UPDATE clientes SET saldo = $1 WHERE whatsapp = $2', [user.saldo, sender]);
      console.log(`Saldo atualizado para o usuário ${sender}. Novo saldo: R$ ${user.saldo}`);
    } catch (err) {
      console.error('Erro ao atualizar saldo do usuário:', err);
    } finally {
      client.release();
    }

    const responsePayload = {
      messaging_product: 'whatsapp',
      to: sender,
      type: 'text',
      text: {
        body: `Seu saldo foi atualizado! Seu novo saldo é R$ ${user.saldo.toFixed(2)}.`
      }
    };

    try {
      await axios.post(`https://graph.facebook.com/v15.0/${phoneNumberId}/messages`, responsePayload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Resposta de adicionar saldo enviada com sucesso');
    } catch (error) {
      console.error('Erro ao enviar mensagem de saldo atualizado:', error.response ? error.response.data : error.message);
    }
  } else {
    console.error(`Usuário ${sender} não encontrado.`);
  }
}

// Função para obter as contas disponíveis no banco de dados, incluindo dados da categoria
async function getContasDisponiveis() {
  const client = await pool.connect();
  try {
    // Realizando uma junção entre a tabela contas e categorias para obter o nome da categoria e o valor
    const res = await client.query(`
      SELECT 
        c.id, 
        c.categoria_id, 
        c.detalhes, 
        c.adicionado_em, 
        c.vencimento, 
        c.disponivel, 
        cat.nome AS categoria_nome,   -- Obtendo o nome da categoria
        cat.valor AS categoria_valor -- Obtendo o valor da categoria
      FROM contas c
      JOIN categorias cat ON c.categoria_id = cat.id
      WHERE c.disponivel = TRUE
    `);

    // Verificando as contas obtidas
    console.log('Contas Obtidas do Banco:', res.rows);

    return res.rows; // Retorna as contas com o nome da categoria e o valor
  } catch (err) {
    console.error('Erro ao buscar contas disponíveis:', err);
    return [];
  } finally {
    client.release();
  }
}

// Função para lidar com a compra de contas e enviar o template de lista
async function handleComprarConta(sender) {
  const contas = await getContasDisponiveis(); // Obter contas disponíveis no banco
  
  // Verificando se as contas foram obtidas corretamente
  console.log('Contas Disponíveis:', contas);
  
  if (contas.length === 0) {
    // Caso não haja contas disponíveis
    await sendMessage(sender, 'No momento não temos contas disponíveis para compra.');
    return;
  }

  // Criando o payload para o template de lista
  const responsePayload = {
    messaging_product: 'whatsapp',
    to: sender,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'Contas Disponíveis'
      },
      body: {
        text: 'Escolha uma conta abaixo para continuar 👇'
      },
      action: {
        button: 'Escolher Conta',
        sections: [
          {
            title: 'Contas Disponíveis',
            rows: contas.map((conta) => {
              if (!conta.categoria_valor) {
                console.error('Erro: conta sem valor:', conta); // Log para identificar contas sem valor
                return null; // Retorna null se não tiver valor
              }

              // Limitar o nome da categoria a 24 caracteres
              const categoriaTitulo = conta.categoria_nome.slice(0, 24);
              
              // Convertendo o valor para número e formatando corretamente
              const valorConvertido = parseFloat(conta.categoria_valor).toFixed(2);
              
              return {
                id: conta.id.toString(),
                title: categoriaTitulo, // Usando o nome da categoria limitado a 24 caracteres
                description: `Valor: R$ ${valorConvertido}`, // Descrição com o valor
              };
            }).filter(Boolean) // Filtra os valores nulos (caso haja contas sem valor)
          }
        ]
      }
    }
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v15.0/${phoneNumberId}/messages`, responsePayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Template de lista enviado com sucesso:', response.data);
  } catch (error) {
    console.error('Erro ao enviar o template de lista:', error.response ? error.response.data : error.message);
  }
}


// Função auxiliar para enviar a mensagem (caso você precise dela em outro contexto)
async function sendMessage(sender, message) {
  const responsePayload = {
    messaging_product: 'whatsapp',
    to: sender,
    type: 'text',
    text: {
      body: message
    }
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v15.0/${phoneNumberId}/messages`, responsePayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Mensagem enviada com sucesso:', response.data);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error.response ? error.response.data : error.message);
  }
}


async function handleSuporte(sender) {
  // Envia um vCard com o número de WhatsApp do dono
  const vCardPayload = {
    messaging_product: 'whatsapp',
    to: sender,
    type: 'contacts',
    contacts: [
      {
        name: {
          formatted_name: 'Douglas Reis', // Nome completo
          first_name: 'Douglas',          // Primeiro nome
          last_name: 'Reis'               // Sobrenome
        },
        phones: [
          {
            phone: dono,  // Número do dono
            type: 'Mobile',
            wa_id: dono,  // wa_id do WhatsApp do dono
          }
        ]
      }
    ]
  };

  try {
    const response = await axios.post(`https://graph.facebook.com/v15.0/${phoneNumberId}/messages`, vCardPayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('vCard enviado com sucesso:', response.data);
  } catch (error) {
    console.error('Erro ao enviar o vCard:', error.response ? error.response.data : error.message);
  }
}



// Iniciar o servidor na porta 3000
app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});