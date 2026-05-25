export const buildHistoryContext = (messages: any[]) => {
  const filtered = messages.filter((m) => m.status === "completed" || !m.status);
  const context: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  
  for (const m of filtered) {
    const role = m.role === "model" ? "model" : "user";
    const text = m.text || m.content || "(Mensagem vazia)";
    
    if (context.length > 0 && context[context.length - 1].role === role) {
      context[context.length - 1].parts[0].text += `\n\n${text}`;
    } else {
      context.push({
        role,
        parts: [{ text }],
      });
    }
  }
  return context;
};
