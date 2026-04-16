const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const MODEL = 'gemini-3.1-pro-preview';
const API_KEY = process.env.GEMINI_API_KEY;

app.post('/analyze', async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set in environment' });

    const { b64, mimeType } = req.body;
    if (!b64) return res.status(400).json({ error: 'Missing b64 field' });

    const PROMPT = `You are a forensic document naming assistant for a multi-family office. Analyze this PDF and extract fields for the filename convention:

AccountName_Institution_DocumentType_xLast4_MM.DD.YYYY

ACCOUNT OWNER RULES:
- Find the person or entity whose name the account belongs to — NOT the bank, brokerage, or any entity acting "as agent", "as trustee", or "as custodian".
- If the owner is an individual person:
  - Determine gender from the first name. Clearly male names (Charles, Robert, James, Michael, David, William, Richard, John, Thomas, Joseph, Curtis, Kenneth) → H. Clearly female names (Mary, Susan, Jennifer, Patricia, Linda, Barbara, Elizabeth, Karen, Lisa, Nancy, Sarah, Jessica) → W.
  - Joint account held by two people → JT.
- If the owner is a company, trust, LLC, or other non-human entity → use the entity name as-is.
- If no owner can be identified → use "" (empty string).
- IGNORE institution/agent names like "Stifel Bank & Trust as Agent", "Fidelity", "Vanguard", etc.

FIELD RULES:
1. accountName: H | W | JT | EntityName | ""
2. institution: Full name + account type (e.g. "Stifel Solutions Managed Account", "Truist Savings", "Wells Fargo Checking")
3. documentType: Statement, Check, Bill, Invoice, Receipt, Confirmation, etc.
4. last4: Account number last 4 digits — look in the header of page 1 near "Account Number". Strip ALL dashes, spaces, asterisks, and x characters first, then take the last 4 digits of the remaining string. Return digits only, no prefix. "" if not found.
5. date: Closing date for statements, document date for all others. Format MM.DD.YYYY with leading zeros.
6. confidence: "high" | "medium" | "low"
7. notes: Brief note on accountName determination or uncertain fields. "" if none.

Return ONLY valid JSON — no markdown fences, no explanation, no other text:
{"accountName":"","institution":"","documentType":"","last4":"","date":"","confidence":"high","notes":""}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType || 'application/pdf', data: b64 } },
              { text: PROMPT }
            ]
          }],
          generationConfig: { maxOutputTokens: 512 }
        })
      }
    );

    const data = await geminiRes.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '{}')
      .replace(/```json|```/g, '').trim();

    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.send('DWS Proxy OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
