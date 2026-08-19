[README.md](https://github.com/user-attachments/files/31202424/README.md)
# 🎙️ AI-Powered Personal Assistant for Alexa

An **Alexa Skill** powered by a large language model (LLM) that holds natural conversations, keeps context, switches personalities on voice command, recognizes you across conversations, and even works as an English teacher.

Built with **Alexa-hosted (Node.js)** + the **Groq API** — no server of your own, using only free tiers.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Free-form questions** | Say anything, with no trigger phrase, and get an answer from the LLM. |
| 🧠 **Conversation memory** | Remembers what was said: *"who was Santos Dumont"* → *"where was he born"* works. |
| 🎭 **Personalities** | Modes `professor`, `piada`, `poeta`, and `teacher` change the tone by voice. |
| 👤 **Recognizes you** | Stores your name (Amazon S3) and greets you in future conversations. |
| 🙋 **Name onboarding** | On first use it asks your name — and can tell a *name* from a *question*. |
| 🇬🇧 **English teacher** | The `teacher` mode replies in English with a native voice (SSML). |
| 🗑️ **Forget** | *"esqueça meu nome"* (forget my name) deletes the stored data. |

> **Note:** the assistant speaks Brazilian Portuguese by default (the skill's locale is `pt-BR`). The voice commands and prompts in this project are in Portuguese; the code and docs are in English.

---

## 🏗️ How it works

```
User  →  Alexa  →  Lambda (Node.js)  →  Groq API (LLM)
(voice)  (transcribes  (builds the prompt   (generates the
          and routes)   and handles logic)    response)
```

The response travels back along the same path and Alexa speaks the generated text.

> ⚠️ **Key constraint:** Alexa expects the response within **~8 seconds**. That's why this project uses **Groq** (low latency), with a 6s `timeout` and a token cap in the code.

The skill **does not host the model** — it calls an external API. The AI model runs on Groq; the Lambda is just the bridge.

---

## 📋 Prerequisites

- An account on the [Amazon Developer Console](https://developer.amazon.com/alexa/console/ask) (free)
- A [Groq](https://console.groq.com) API key (free, no credit card)
- *(Optional)* An Echo device on the **same Amazon account** to test by voice

---

## 🚀 Step by step

### 1. Get your Groq API key

1. Go to [console.groq.com](https://console.groq.com) and create an account.
2. Open **API Keys** → **Create API Key**.
3. Copy the key (starts with `gsk_...`) — it's shown only once.

### 2. Create the skill

1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → **Create Skill**.
2. **Name:** anything. **Primary locale:** `Portuguese (BR)`.
3. **Type of experience:** *Other* · **Model:** *Custom* · **Hosting:** **Alexa-hosted (Node.js)**.
4. **Hosting region:** *US East (N. Virginia)*.
5. On the templates screen, choose **Start from Scratch**.

### 3. Set the invocation name

In the **Build** tab → **Invocation**, set the name (e.g. `assistente pessoal`).
Rules: lowercase, 2+ words, no brand names, avoid English or unusual spellings.

### 4. Paste the interaction model

**Build** tab → **Interaction Model** → **JSON Editor**.
Paste the contents of [`interaction-model/pt-BR.json`](interaction-model/pt-BR.json), adjust the `invocationName` if you want, then click **Save** → **Build skill**.

### 5. Add the code

**Code** tab:

1. Replace the contents of `lambda/index.js` with [`lambda/index.js`](lambda/index.js) from this repo.
2. Open `lambda/package.json` and make sure it has the dependencies from [`lambda/package.json`](lambda/package.json) (especially **`ask-sdk-s3-persistence-adapter`**).
3. Create a `lambda/config.js` file with your key (see step 6).

### 6. Configure the API key

Create the file `lambda/config.js` (copy it from [`config.example.js`](lambda/config.example.js)):

```javascript
module.exports = {
  GROQ_API_KEY: 'gsk_YOUR_KEY_HERE',
};
```

> 🔒 **Security:** `config.js` is in `.gitignore` and must **never** be pushed to the repository. Share only `config.example.js`.

### 7. Deploy and test

1. Click **Deploy** and wait for confirmation.
2. In the **Test** tab, switch the selector from *Off* to **Development**.
3. Type or say: `abrir assistente pessoal`, then ask a question.

---

## 🗣️ Example commands

| You say | What happens |
|---|---|
| *"abrir assistente pessoal"* | Opens the skill |
| *"o que é fotossíntese"* | Free-form question to the LLM |
| *"modo piada"* | Activates the "joke" personality |
| *"modo teacher"* | Activates the English teacher (native voice) |
| *"meu nome é João"* | Saves your name |
| *"esqueça meu nome"* | Deletes the stored name |

---

## 📁 Project structure

```
.
├── lambda/
│   ├── index.js             # Skill logic (handlers + LLM call)
│   ├── config.example.js    # Key template (copy to config.js)
│   └── package.json         # Dependencies
├── interaction-model/
│   └── pt-BR.json           # Interaction model (invocation, intent, slot)
├── .gitignore
└── README.md
```

---

## 💡 Technical decisions (and pitfalls)

A few lessons that apply to any AI-powered skill:

- **Free-text custom slot instead of `AMAZON.SearchQuery`.** `SearchQuery` requires a carrier phrase (e.g. *"tell me ..."*). A **custom slot** captures the raw utterance without a prefix.
- **Route in code, not with multiple intents.** With a catch-all slot, adding other intents that compete with it is unstable. The fix: let everything fall into the free intent and decide by text (`if/else`) inside the code.
- **Native `https` module instead of `fetch`.** The Alexa-hosted environment runs Node 16, where `fetch` doesn't exist. `https` works on any version.
- **Reasoning models need a high `max_tokens`.** Models like `gpt-oss-120b` spend tokens "thinking"; with a low cap the response comes back empty. Use `max_tokens: 1024` and `reasoning_effort: 'low'`.
- **S3 persistence requires `withApiClient`.** The Alexa-hosted `S3PersistenceAdapter` needs `.withApiClient(new Alexa.DefaultApiClient())` on the builder, otherwise reads fail.

---

## ⚠️ Known limitations

- **The skill speaks native English but "hears" in pt-BR.** Speech recognition uses the skill's locale (pt-BR). To practice *speaking* English accurately, you'd need to add the `en-US` locale (a second interaction model).
- **Mode and history live in the session.** Only the name is persisted across conversations; the active mode and history are lost when the skill closes.
- **Groq free tier.** Subject to request limits and changes in available models.

---

## 🔮 Possible next steps

- Persist the preferred mode in S3 (alongside the name)
- External integrations: weather, news, exchange rates (public APIs)
- Progressive Response (*"let me think..."* while the LLM processes)
- `en-US` locale for real English conversation practice

---

## 📄 License

MIT — feel free to use, modify, and share.
