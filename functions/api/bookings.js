export async function onRequest(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ error: "Binding DB não encontrado" }), { status: 500 });
  }

  try {
    // LER AGENDAMENTOS
    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM agendamentos").all();
      return new Response(JSON.stringify(results || []), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // CRIAR AGENDAMENTO OU BLOQUEIO
    if (request.method === "POST") {
      const b = await request.json();
      
      await env.DB.prepare(`
        INSERT INTO agendamentos (date, time, profId, profName, clientId, clientName, clientUnit, clientGender, desc, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        b.date, 
        b.time, 
        b.profId, 
        b.profName, 
        b.clientId || null,     // Pode ser nulo se for um bloqueio
        b.clientName || null,   // Pode ser nulo se for um bloqueio
        b.clientUnit || null,   // Pode ser nulo se for um bloqueio
        b.clientGender || null, // Pode ser nulo se for um bloqueio
        b.desc || "Atendimento", 
        b.type || "appt"
      ).run();
      
      return new Response(JSON.stringify({ success: true }), { 
        status: 201, 
        headers: { "Content-Type": "application/json" } 
      });
    }

    // DELETAR/CANCELAR AGENDAMENTO
    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id");
      await env.DB.prepare("DELETE FROM agendamentos WHERE id = ?").bind(id).run();
      return new Response(null, { status: 204 });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { "Content-Type": "application/json" } 
    });
  }
}
