import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 10. Logs requirements
  // api_chat_received etc.
  
  // 4. DIAGNOSTIC ENDPOINT
  app.get("/api/health-gemini", (req, res) => {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({
      ok: true,
      env: process.env.NODE_ENV || "development",
      geminiKeyLoaded: hasKey,
      serverTime: new Date().toISOString()
    });
  });

  // Robust helper to get a token from Cakto
  async function generateCaktoToken(clientId: string, clientSecret: string) {
    const url = "https://api.cakto.com.br/public_api/token/";
    
    // Method 1: JSON with grant_type
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret
        })
      });
      if (response.ok) {
        const data = await response.json();
        const token = data.access_token || data.token || data.accessToken;
        if (token) return { success: true, token, method: "json_with_grant" };
      }
    } catch (e) {
      console.warn("[Cakto Health] Method 1 failed:", e);
    }

    // Method 2: JSON without grant_type
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret
        })
      });
      if (response.ok) {
        const data = await response.json();
        const token = data.access_token || data.token || data.accessToken;
        if (token) return { success: true, token, method: "json_without_grant" };
      }
    } catch (e) {
      console.warn("[Cakto Health] Method 2 failed:", e);
    }

    // Method 3: Form URL Encoded
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      if (response.ok) {
        const data = await response.json();
        const token = data.access_token || data.token || data.accessToken;
        if (token) return { success: true, token, method: "urlencoded_with_grant" };
      }
    } catch (e) {
      console.warn("[Cakto Health] Method 3 failed:", e);
    }

    // Method 4: Form URL Encoded without grant_type
    try {
      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      if (response.ok) {
        const data = await response.json();
        const token = data.access_token || data.token || data.accessToken;
        if (token) return { success: true, token, method: "urlencoded_without_grant" };
      }
    } catch (e) {
      console.warn("[Cakto Health] Method 4 failed:", e);
    }

    return { success: false, message: "Could not retrieve access_token from Cakto using any standard method." };
  }

  // API to diagnose general health of Cakto Public API connection
  app.get("/api/caktoHealthCheck", async (req, res) => {
    const clientId = process.env.CAKTO_CLIENT_ID;
    const clientSecret = process.env.CAKTO_CLIENT_SECRET;
    const productId = process.env.CAKTO_PRODUCT_ID_LIAM;
    const productName = process.env.CAKTO_PRODUCT_NAME_LIAM;

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        ok: false,
        step: "env",
        message: "CAKTO_CLIENT_ID or CAKTO_CLIENT_SECRET variables are missing from environment"
      });
    }

    console.log(`[Cakto Diagnostic] Starting health check...`);
    
    // Generate Token
    const authResult = await generateCaktoToken(clientId, clientSecret);
    if (!authResult.success || !authResult.token) {
      console.error(`[Cakto Diagnostic] Token generation failed: ${authResult.message}`);
      return res.status(401).json({
        ok: false,
        step: "token",
        status: 401,
        message: authResult.message || "Failed to generate token"
      });
    }

    console.log(`[Cakto Diagnostic] Token successfully generated using method: ${authResult.method}`);

    // Try calling the orders API
    let lastUrl = "";
    try {
      const endpoints = [
        "https://api.cakto.com.br/public_api/orders/",
        "https://api.cakto.com.br/public_api/orders"
      ];
      
      let lastStatus = 500;
      let lastErrorText = "";
      
      for (const url of endpoints) {
        lastUrl = url;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${authResult.token}`,
            "Content-Type": "application/json"
          }
        });

        if (response.ok) {
          console.log(`[Cakto Diagnostic] Direct endpoint ${url} connected perfectly with 200 OK.`);
          return res.json({
            ok: true,
            tokenGenerated: true,
            ordersEndpoint: "ok",
            status: 200,
            methodUsed: authResult.method,
            endpointMatched: url,
            productIdLoaded: !!productId,
            productNameLoaded: !!productName
          });
        }
        
        lastStatus = response.status;
        lastErrorText = await response.text().catch(() => "Unknown endpoint error");
        console.warn(`[Cakto Diagnostic] Endpoint ${url} returned status ${response.status}: ${lastErrorText}`);
      }

      return res.status(lastStatus).json({
        ok: false,
        step: "orders",
        status: lastStatus,
        message: `Orders check failed at ${lastUrl}: ${lastErrorText}`
      });

    } catch (fetchErr: any) {
      console.error(`[Cakto Diagnostic] Orders API connection error:`, fetchErr);
      return res.status(500).json({
        ok: false,
        step: "orders",
        status: 500,
        message: fetchErr.message || String(fetchErr)
      });
    }
  });

  function normalizeEmail(email: string): string {
    return String(email || "").trim().toLowerCase();
  }

  function extractEmailsFromItem(item: any): string[] {
    const emails: string[] = [];
    if (!item) return emails;

    // Direct email property
    if (typeof item.email === "string" && item.email) {
      emails.push(item.email);
    }
    if (typeof item.customer_email === "string" && item.customer_email) {
      emails.push(item.customer_email);
    }

    // Nested in customer object
    if (item.customer && typeof item.customer === "object") {
      if (typeof item.customer.email === "string" && item.customer.email) {
        emails.push(item.customer.email);
      }
      if (typeof item.customer.customer_email === "string" && item.customer.customer_email) {
        emails.push(item.customer.customer_email);
      }
    }

    // Nested in client object
    if (item.client && typeof item.client === "object") {
      if (typeof item.client.email === "string" && item.client.email) {
        emails.push(item.client.email);
      }
    }

    // Nested in user object
    if (item.user && typeof item.user === "object") {
      if (typeof item.user.email === "string" && item.user.email) {
        emails.push(item.user.email);
      }
    }

    // Nested in customer_details object
    if (item.customer_details && typeof item.customer_details === "object") {
      if (typeof item.customer_details.email === "string" && item.customer_details.email) {
        emails.push(item.customer_details.email);
      }
    }

    return emails.map(e => e.trim().toLowerCase()).filter(Boolean);
  }

  // API to test specific email against all public Cakto endpoints
  app.get("/api/testCaktoEmail", async (req, res) => {
    const rawEmail = req.query.email;
    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({ error: "Query parameter 'email' is required" });
    }

    const email = rawEmail.trim().toLowerCase();
    const clientId = process.env.CAKTO_CLIENT_ID || '';
    const clientSecret = process.env.CAKTO_CLIENT_SECRET || '';
    const productId = process.env.CAKTO_PRODUCT_ID_LIAM || '';
    const productName = process.env.CAKTO_PRODUCT_NAME_LIAM || '';

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        ok: false,
        message: "Cakto environment credentials not configured."
      });
    }

    console.log(`[Cakto Diagnostic Email] Testing email '${email}' against Cakto public APIs...`);

    // Generate Token
    const authResult = await generateCaktoToken(clientId, clientSecret);
    if (!authResult.success || !authResult.token) {
      console.error(`[Cakto Diagnostic Email] Token generation failed.`);
      return res.status(401).json({
        ok: false,
        step: "token",
        message: authResult.message || "Failed to generate token"
      });
    }

    const urls = [
      `https://api.cakto.com.br/public_api/orders/?email=${encodeURIComponent(email)}`,
      `https://api.cakto.com.br/public_api/subscriptions/?email=${encodeURIComponent(email)}`,
      `https://api.cakto.com.br/public_api/customers/?email=${encodeURIComponent(email)}`,
      `https://api.cakto.com.br/public_api/orders?email=${encodeURIComponent(email)}`,
      `https://api.cakto.com.br/public_api/subscriptions?email=${encodeURIComponent(email)}`,
      `https://api.cakto.com.br/public_api/customers?email=${encodeURIComponent(email)}`
    ];

    const results: any[] = [];
    let recordFound = false;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authResult.token}`,
            'Content-Type': 'application/json'
          }
        });

        const status = response.status;
        let responseBody: any = null;
        if (response.ok) {
          responseBody = await response.json();
          
          let items: any[] = [];
          if (Array.isArray(responseBody)) {
            items = responseBody;
          } else if (responseBody && Array.isArray(responseBody.orders)) {
            items = responseBody.orders;
          } else if (responseBody && Array.isArray(responseBody.subscriptions)) {
            items = responseBody.subscriptions;
          } else if (responseBody && Array.isArray(responseBody.customers)) {
            items = responseBody.customers;
          } else if (responseBody && Array.isArray(responseBody.data)) {
            items = responseBody.data;
          } else if (responseBody && Array.isArray(responseBody.results)) {
            items = responseBody.results;
          } else if (responseBody && typeof responseBody === 'object') {
            items = [responseBody];
            for (const value of Object.values(responseBody)) {
              if (Array.isArray(value)) {
                items.push(...value);
              }
            }
          }

          const matchedItems = items.map((item: any) => {
            if (!item) return null;
            
            const rawStatus = String(item.status || item.order_status || item.payment_status || item.subscription_status || '').toLowerCase();
            const isValidStatus = ['paid', 'approved', 'active', 'pago', 'aprovado', 'concluido', 'completed', 'success'].includes(rawStatus);

            const isCustomerEndpoint = url.includes('/customers');
            const valid = isCustomerEndpoint || isValidStatus;

            const itemPid = String(item.product_id || item.productId || (item.product && item.product.id) || '');
            const itemPname = String(item.product_name || item.productName || (item.product && item.product.name) || '');

            const matchesPid = productId && itemPid.includes(productId);
            const matchesPname = productName && itemPname.toLowerCase().includes(productName.toLowerCase());

            const matchProduct = matchesPid || matchesPname || (!productId && !productName);

            // Exact email verification matching
            const inputEmail = normalizeEmail(email);
            const extractedEmails = extractEmailsFromItem(item);
            const emailMatches = extractedEmails.includes(inputEmail);

            const isTrulyMatchingAndValid = matchProduct && valid && emailMatches;

            if (isTrulyMatchingAndValid) {
              recordFound = true;
            }

            console.log(`[Cakto Diagnostic Email LOG] URL: ${url}`);
            console.log(`[Cakto Diagnostic Email LOG] Found record - Pid: ${itemPid}, Name: ${itemPname}, Status: ${rawStatus}, ValidToUnlock: ${valid}, MatchesFilterProduct: ${matchProduct}, EmailMatches: ${emailMatches}`);

            return {
              product_id: itemPid,
              product_name: itemPname,
              status: rawStatus,
              isValidToUnlock: valid && emailMatches,
              matchesFilterProduct: !!matchProduct,
              emailMatches,
              extracted_emails: extractedEmails,
              fullRecord: item
            };
          }).filter(Boolean);

          results.push({
            url,
            status,
            success: true,
            recordsFoundCount: items.length,
            matchingRecords: matchedItems
          });
        } else {
          const errText = await response.text().catch(() => '');
          results.push({
            url,
            status,
            success: false,
            error: errText
          });
        }
      } catch (err: any) {
        results.push({
          url,
          success: false,
          error: err.message || String(err)
        });
      }
    }

    res.json({
      email,
      targetProductId: productId,
      targetProductName: productName,
      recordFound,
      diagnosticResults: results
    });
  });

  // Helper to query Cakto API securely
  async function queryCakto(email: string): Promise<{ authorized: boolean; status?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const clientId = process.env.CAKTO_CLIENT_ID || '';
    const clientSecret = process.env.CAKTO_CLIENT_SECRET || '';
    const productId = process.env.CAKTO_PRODUCT_ID_LIAM || '';
    const productName = process.env.CAKTO_PRODUCT_NAME_LIAM || '';

    if (!clientId || !clientSecret) {
      console.warn(`[Cakto Backend] CAKTO_CLIENT_ID or CAKTO_CLIENT_SECRET not set in environment.`);
      return { authorized: false, status: 'error' };
    }

    // 1. Generate token using generateCaktoToken
    const authResult = await generateCaktoToken(clientId, clientSecret);
    if (!authResult.success || !authResult.token) {
      console.error(`[Cakto Backend] Token generation failed during real login query.`);
      return { authorized: false, status: 'error' };
    }

    console.log(`[Cakto Backend] Token gerado com sucesso usando método: ${authResult.method}`);
    console.log(`[Cakto Backend] Consultando orders com Authorization Bearer`);

    // Public API endpoints
    const urls = [
      `https://api.cakto.com.br/public_api/orders/?email=${encodeURIComponent(cleanEmail)}`,
      `https://api.cakto.com.br/public_api/subscriptions/?email=${encodeURIComponent(cleanEmail)}`,
      `https://api.cakto.com.br/public_api/customers/?email=${encodeURIComponent(cleanEmail)}`,
      `https://api.cakto.com.br/public_api/orders?email=${encodeURIComponent(cleanEmail)}`,
      `https://api.cakto.com.br/public_api/subscriptions?email=${encodeURIComponent(cleanEmail)}`,
      `https://api.cakto.com.br/public_api/customers?email=${encodeURIComponent(cleanEmail)}`
    ];

    let hasPendingOrder = false;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authResult.token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const body = await response.json();

          let items: any[] = [];
          if (Array.isArray(body)) {
            items = body;
          } else if (body && Array.isArray(body.orders)) {
            items = body.orders;
          } else if (body && Array.isArray(body.subscriptions)) {
            items = body.subscriptions;
          } else if (body && Array.isArray(body.customers)) {
            items = body.customers;
          } else if (body && Array.isArray(body.data)) {
            items = body.data;
          } else if (body && Array.isArray(body.results)) {
            items = body.results;
          } else if (body && typeof body === 'object') {
            items = [body];
            for (const value of Object.values(body)) {
              if (Array.isArray(value)) {
                items.push(...value);
              }
            }
          }

          for (const item of items) {
            if (!item) continue;

            const isCustomerEndpoint = url.includes('/customers');
            const rawStatus = String(item.status || item.order_status || item.payment_status || item.subscription_status || '').toLowerCase();
            const isValidStatus = ['paid', 'approved', 'active', 'pago', 'aprovado', 'concluido', 'completed', 'success'].includes(rawStatus);
            const isWaitingPayment = ['waiting_payment', 'pending', 'waiting', 'aguardando', 'processing', 'processando'].includes(rawStatus);

            const itemPid = String(item.product_id || item.productId || (item.product && item.product.id) || '');
            const itemPname = String(item.product_name || item.productName || (item.product && item.product.name) || '');

            const matchesPid = productId && itemPid.includes(productId);
            const matchesPname = productName && itemPname.toLowerCase().includes(productName.toLowerCase());

            const isProductMatch = matchesPid || matchesPname || (!productId && !productName);

            // Exact email verification match in item
            const inputEmail = normalizeEmail(cleanEmail);
            const extractedEmails = extractEmailsFromItem(item);
            const emailMatches = extractedEmails.includes(inputEmail);

            if (isProductMatch) {
              console.log(`[Cakto Backend] E-mail digitado: ${inputEmail}`);
              const returnedEmailString = extractedEmails.length > 0 ? extractedEmails[0] : 'nenhum encontrado';
              console.log(`[Cakto Backend] E-mail retornado no pedido: ${returnedEmailString}`);
              console.log(`[Cakto Backend] EmailMatches: ${emailMatches}`);

              if (!emailMatches) {
                console.log(`[Cakto Backend] Produto LIAM encontrado, mas e-mail não corresponde exatamente. Acesso negado.`);
                continue;
              }

              console.log(`[Cakto Backend] Produto LIAM encontrado`);
              console.log(`[Cakto Backend] Status do pedido: ${rawStatus}`);
              
              if (isValidStatus || isCustomerEndpoint) {
                console.log(`[Cakto Backend] Compra válida encontrada. Acesso liberado.`);
                return { authorized: true };
              } else if (isWaitingPayment) {
                hasPendingOrder = true;
              }
            }
          }
        }
      } catch (err) {
        console.error(`[Cakto Backend] Error requesting ${url}:`, err);
      }
    }

    if (hasPendingOrder) {
      console.log(`[Cakto Backend] Produto LIAM encontrado, mas pagamento ainda pendente.`);
      return { authorized: false, status: 'waiting_payment' };
    }

    return { authorized: false, status: 'not_found' };
  }

  // Endpoint to validate email against Cakto
  app.post("/api/login/validate", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const result = await queryCakto(email);
      res.json(result);
    } catch (error) {
      console.error("[Cakto API Endpoint Error]:", error);
      res.status(500).json({ error: "Server error querying Cakto API" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
