# Guia de Geração do APK e do Google Play App Bundle (AAB) para o Liam AI 🚀

Para que você possa gerar o arquivo **APK** (para testar em celulares Android) ou **AAB** (para enviar diretamente para a Google Play Store), adicionamos suporte nativo de build com scripts prontos para você executar.

---

## 🛠️ O que foi adicionado ao projeto:

1. **Scripts Automatizados no `package.json`**:
   - `"android:sync"`: Compila os arquivos mais recentes do React/Vite e sincroniza-os com a pasta nativa do Android.
   - `"android:build"`: Compila a plataforma inteira e executa o builder do Capacitor para gerar os arquivos prontos de Android nativo.
2. **Permissão do Gradle configurada**:
   - O arquivo `gradlew` correspondente foi configurada com as permissões de execução adequadas (`chmod +x`).

---

## 📦 Como exportar e gerar o arquivo APK / AAB:

Como o ambiente online em que o projeto está rodando é um servidor focado em desenvolvimento web em Node.js (sem suporte para o pesado compilador do Android SDK e Java instalados), você precisará rodar a etapa de compilação em seu computador (ou usar uma esteira de CI/CD como o GitHub Actions). 

Siga os seguintes passos simples abaixo para compilar localmente:

### Passo 1: Baixar o Cópia do Código do Liam AI
1. No canto superior direito do **Google AI Studio / Editor**, abra o menu de configurações (ou clique no menu de exportação).
2. Selecione a opção **Export as ZIP** para baixar todo o código pronto do projeto para o seu computador (ou envie diretamente para o seu GitHub clicando em **Export to GitHub**).

### Passo 2: Configurar o seu ambiente local
Certifique-se de ter instalado em seu computador:
- **Node.js** (versão 18 ou superior)
- **Java JDK** (recomendado Java 17)
- **Android Studio** (que contém o Android SDK para compilação nativa)

### Passo 3: Instalar as dependências e preparar o código
Abra o terminal do seu computador dentro da pasta descompactada e rode:
```bash
# 1. Instalar pacotes de dependências
npm install

# 2. Dar de volta a permissão de execução ao Gradle (necessário apenas em sistemas Mac/Linux)
chmod +x android/gradlew
```

### Passo 4: Rodar o comando de Compilação
Agora, rode o script criado especificamente para isso:
```bash
npm run android:build
```

O Capacitor detectará seu ambiente local e iniciará a compilação do projeto em Gradle. Ele gerará os seguintes arquivos:

* **APK de Teste (Debug)**:  
  📍 Onde fica: `android/app/build/outputs/apk/debug/app-debug.apk`
* **App Bundle para Google Play (AAB)**:  
  📍 Onde fica: `android/app/build/outputs/bundle/release/app-release.aab`

---

## 🔑 Como gerar a assinatura de Produção para a Google Play:

Ao enviar um arquivo `.aab` para a Google Play Store, o Google exige que o aplicativo seja assinado com uma chave de produção confiável.

Para fazer isso facilmente via linha de comando local:

1. Gere um arquivo de chave privada (`keystore`) usando o utilitário do Java:
   ```bash
   keytool -genkey -v -keystore liam-release-key.keystore -alias liam-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Após gerar a chave, rode o comando do Capacitor apontando para ela:
   ```bash
   npx cap build android --keystorepath="liam-release-key.keystore" --keystorepass="SUA_SENHA_AQUI" --keystorealias="liam-alias" --keystorealiaspass="SUA_SENHA_AQUI"
   ```

Isso gerará o arquivo `.aab` totalmente assinado e pronto para fazer upload no console da Google Play Store!
