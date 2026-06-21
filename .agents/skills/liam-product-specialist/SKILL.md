---
name: liam-product-specialist
description: Especialista de produto para garantir a segurança das regras didáticas, PCM, fluxo de áudio e banco de dados do LIAM.
---

# Skill de Especialista de Produto: LIAM

Esta Skill define as diretrizes estritas que qualquer agente de IA deve seguir ao trabalhar no projeto LIAM. Ela garante que a integridade didática, as regras de áudio e a segurança dos dados do aluno sejam preservadas.

---

## 1. Diretrizes Obrigatórias de Inicialização

Antes de realizar QUALQUEER alteração ou planejamento de alteração de código:
1. **Ler o arquivo `LIAM_CONTEXT.md`** na raiz do projeto para entender a visão do produto, a personalidade do LIAM e o mapeamento de arquivos sensíveis.
2. **Respeitar o fluxo de aprovação:** Sempre apresentar um plano de implementação detalhado antes de modificar arquivos críticos.

---

## 2. Preservação Absoluta (Arquivos Protegidos)

Os seguintes arquivos e subsistemas possuem **proteção de integridade**. Não altere sem justificativa extremamente detalhada e consentimento do usuário:

* **[LiveMode.tsx](file:///C:/Users/rafae/.gemini/antigravity-ide/scratch/Projects-AI-/src/pages/LiveMode.tsx):**
  * **Lógica de Áudio PCM:** Não altere as taxas de amostragem (`16000` para gravação, `24000` para reprodução) e os buffers de manipulação.
  * **Velocidade de Processamento:** O processador de áudio em tempo real e a conversão de float/int16/base64 são sensíveis à latência.
  * **Botão Repetir / Controle do Microfone:** Não altere os estados visuais ou eventos de gatilho do microfone.
* **[geminiService.ts](file:///C:/Users/rafae/.gemini/antigravity-ide/scratch/Projects-AI-/src/services/geminiService.ts):**
  * **Lógica Pedagógica:** As regras da função `getSystemInstruction` garantem que o LIAM se comporte conforme o nível do aluno e use o português apenas como suporte estratégico.
  * **Comandos Pedagógicos:** Preservar a metodologia de exigir a repetição do aluno antes de avançar.
* **[firebase.ts](file:///C:/Users/rafae/.gemini/antigravity-ide/scratch/Projects-AI-/src/lib/firebase.ts) e `firestore.rules`:**
  * **Login e Dados do Aluno:** A autenticação, persistência IndexedDB offline e regras de segurança não podem sofrer regressões para garantir a segurança dos dados do usuário.

---

## 3. Regras de Negócio e Comportamento da IA

Qualquer modificação que impacte o agente conversacional LIAM deve seguir as seguintes restrições:
1. **Sem Encerramento Autônomo:** O LIAM **nunca** deve desligar ou encerrar a aula de forma autônoma. O controle é sempre do aluno via botão físico na tela.
2. **Sem Perguntas de Pausa/Continuidade:** Evitar fluxos que fiquem perguntando ao aluno repetidamente se ele quer continuar ou parar a aula.
3. **Responsividade Mobile:** O layout das páginas (principalmente a tela de Live Mode no celular) deve se manter responsivo, sem scroll horizontal, adaptando-se a diferentes telas.
4. **Sem Alterações no Cakto:** Se integrados no futuro, fluxos de pagamento ou webhooks não devem ser alterados de forma a expor credenciais ou corromper a sincronização de acessos.

---

## 4. Fluxo de Trabalho (Segurança e Testes)

* **Planejamento Prévio:** Qualquer edição em arquivos que não sejam simples documentações exige a criação prévia de um plano de implementação.
* **Verificação Pós-Edição:**
  * Executar a validação estática via `npm run lint` para garantir integridade do TypeScript.
  * Validar a compilação do frontend com `npm run build`.
