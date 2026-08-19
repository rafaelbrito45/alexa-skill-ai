const Alexa = require('ask-sdk-core');
const { GROQ_API_KEY } = require('./config');
const https = require('https');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');

const MODEL = 'openai/gpt-oss-120b';

const SYSTEM_PROMPT =
  'Você é um assistente de voz da Alexa. Responda sempre em português do Brasil, ' +
  'em no máximo 2 frases curtas, em texto puro. Não use markdown, listas, ' +
  'emojis nem títulos. Seja direto e natural para ser lido em voz alta.';
 
const PERSONALITIES = {
  padrao: 'Você é um assistente de voz da Alexa. Responda sempre em português do Brasil, em no máximo 2 frases curtas, em texto puro. Não use markdown, listas, emojis nem títulos. Seja direto e natural para ser lido em voz alta.',
  professor: 'Você é um professor paciente e didático. Explique em português do Brasil, de forma simples e clara, em no máximo 3 frases curtas, como se ensinasse a um iniciante. Texto puro, sem markdown.',
  piada: 'Você é um comediante brasileiro. Responda em português do Brasil sempre com bom humor e uma piada ou trocadilho, em no máximo 2 frases curtas. Texto puro, sem markdown.',
  poeta: 'Você é um poeta. Responda em português do Brasil de forma poética e breve, em no máximo 2 frases. Texto puro, sem markdown.',
  teacher: 'You are a friendly English teacher helping a Brazilian student practice conversational English. Always reply in English, using simple and clear language, in at most 2 short sentences. Gently correct mistakes when relevant. Keep the conversation going by asking a follow-up question. Plain text only, no markdown.',
};

function formatSpeech(text, personality) {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  if (personality === 'teacher') {
    return '<voice name="Joanna"><lang xml:lang="en-US">' + safe + '</lang></voice>';
  }
  return safe;
}

const FALLBACK_SPEECH = 'Desculpe, não consegui responder agora. Pode tentar de novo?';


function askLlm(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0.7,
      reasoning_effort: 'low',
      messages: messages
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GROQ_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 6000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('Groq responded ' + res.statusCode + ': ' + data));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices[0].message.content.trim());
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('timeout', () => { req.destroy(new Error('Groq request timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    let speech;
    const persistent = await handlerInput.attributesManager.getPersistentAttributes() || {};

    if (persistent.name) {
      speech = 'Olá de novo, ' + persistent.name + '! Em que posso ajudar?';
    } else {
      const attributes = handlerInput.attributesManager.getSessionAttributes();
      attributes.awaitingName = true;
      handlerInput.attributesManager.setSessionAttributes(attributes);
      speech = 'Olá! Antes de começarmos, como posso te chamar?';
    }

    return handlerInput.responseBuilder
      .speak(speech)
      .reprompt('Como posso te chamar?')
      .getResponse();
  }
};

const MAX_TURNS = 6;

const PerguntaIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PerguntaIntent';
  },
  async handle(handlerInput) {
    const question = Alexa.getSlotValue(handlerInput.requestEnvelope, 'pergunta');

    if (!question) {
      const speech = 'Não entendi a pergunta. Pode repetir?';
      return handlerInput.responseBuilder.speak(speech).reprompt(speech).getResponse();
    }

    const attributes = handlerInput.attributesManager.getSessionAttributes();
    
    // catches name when the skill asks
    if (attributes.awaitingName) {
      const raw = question.toLowerCase().trim();

      const questionWords = ['que', 'qual', 'quais', 'quanto', 'quanta', 'quantos', 'quantas',
        'como', 'quem', 'onde', 'quando', 'por que', 'porque', 'me diga', 'me fala', 'fala', 'conta'];
      const hasExplicitName = /^(?:meu nome é|me chamo|pode me chamar de|sou o|sou a)\s+/.test(raw);
      const looksLikeQuestion = !hasExplicitName
        && (raw.split(' ').length > 2 || questionWords.some(w => raw.startsWith(w)));

      if (looksLikeQuestion) {
        attributes.awaitingName = false;
        handlerInput.attributesManager.setSessionAttributes(attributes);
        
      } else {
        const m = raw.match(/^(?:meu nome é|me chamo|pode me chamar de|sou o|sou a)\s+(.+)$/);
        let name = m ? m[1].trim().split(' ')[0] : raw.split(' ')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);

        const persistent = await handlerInput.attributesManager.getPersistentAttributes() || {};
        persistent.name = name;
        handlerInput.attributesManager.setPersistentAttributes(persistent);
        await handlerInput.attributesManager.savePersistentAttributes();

        attributes.awaitingName = false;
        handlerInput.attributesManager.setSessionAttributes(attributes);

        const speech = 'Prazer, ' + name + '! Em que posso ajudar?';
        return handlerInput.responseBuilder.speak(speech).reprompt('Pode perguntar.').getResponse();
      }
    }

    // ---Change mode detection ---
    const lower = question.toLowerCase().trim();
    const matchModo = lower.match(/^(?:modo|ativar modo|entra no modo|vira|seja)\s+(.+)$/);
    if (matchModo) {
      let modo = matchModo[1].trim();
      if (modo === 'padrão' || modo === 'padrao' || modo === 'normal') { modo = 'padrao'; }
      if (PERSONALITIES[modo]) {
        attributes.personality = modo;
        attributes.history = []; 
        handlerInput.attributesManager.setSessionAttributes(attributes);
        const nomeAmigavel = (modo === 'padrao') ? 'padrão' : modo;
        const speech = 'Pronto, agora estou no modo ' + nomeAmigavel + '. Manda bala.';
        return handlerInput.responseBuilder.speak(speech).reprompt('Pode perguntar.').getResponse();
      }
      
      const speech = 'Não conheço esse modo. Tenho os modos professor, piada, poeta, teacher e padrão.';
      return handlerInput.responseBuilder.speak(speech).reprompt(speech).getResponse();
    }
    
    //erase name
    const matchForget = lower.match(/^(?:esque[çc]a meu nome|esque[çc]a de mim|apague meu nome|me esque[çc]a|esquecer meu nome|esquece meu nome)$/);
    if (matchForget) {
      await handlerInput.attributesManager.deletePersistentAttributes();
      const speech = 'Pronto, esqueci quem você é. Pode se apresentar de novo quando quiser.';
      return handlerInput.responseBuilder.speak(speech).reprompt('Pode perguntar.').getResponse();
    }
    
    //name detection
     const matchName = lower.match(/^(?:meu nome é|me chamo|pode me chamar de|sou o|sou a)\s+(.+)$/);
    if (matchName) {
      
      let name = matchName[1].trim().split(' ')[0];
      name = name.charAt(0).toUpperCase() + name.slice(1);

      const persistent = await handlerInput.attributesManager.getPersistentAttributes() || {};
      persistent.name = name;
      handlerInput.attributesManager.setPersistentAttributes(persistent);
      await handlerInput.attributesManager.savePersistentAttributes();

      const speech = 'Prazer, ' + name + '! Vou lembrar de você. Em que posso ajudar?.';
      return handlerInput.responseBuilder.speak(speech).reprompt('Pode perguntar.').getResponse();
    }
   

    const history = attributes.history || [];
    const activePersonality = attributes.personality || 'padrao';

    const messages = [{ role: 'system', content: PERSONALITIES[activePersonality] }]
      .concat(history)
      .concat([{ role: 'user', content: question }]);

    let speech;
    try {
      speech = await askLlm(messages);
    } catch (error) {
      console.error('Error calling the model:', error);
      speech = FALLBACK_SPEECH;
    }

    history.push({ role: 'user', content: question });
    history.push({ role: 'assistant', content: speech });
    attributes.history = history.slice(-MAX_TURNS * 2);
    attributes.personality = activePersonality;
    handlerInput.attributesManager.setSessionAttributes(attributes);
    
    const spokenSpeech = formatSpeech(speech, activePersonality);
    const repromptText = (activePersonality === 'teacher')
      ? '<voice name="Joanna"><lang xml:lang="en-US">Anything else you want to talk about?</lang></voice>'
      : 'Quer perguntar mais alguma coisa?';

    return handlerInput.responseBuilder
      .speak(spokenSpeech)
      .reprompt(repromptText)
      .getResponse();
  }
};


const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speech = 'É só me fazer uma pergunta e eu respondo. O que você quer saber?';
    return handlerInput.responseBuilder.speak(speech).reprompt(speech).getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak('Até mais!').getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('Unhandled exception:', error);
    return handlerInput.responseBuilder
      .speak(FALLBACK_SPEECH)
      .reprompt(FALLBACK_SPEECH)
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .withPersistenceAdapter(
    new persistenceAdapter.S3PersistenceAdapter({
      bucketName: process.env.S3_PERSISTENCE_BUCKET
    })
  )
  .withApiClient(new Alexa.DefaultApiClient())
  .addRequestHandlers(
    LaunchRequestHandler,
    PerguntaIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
