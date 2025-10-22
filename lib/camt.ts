function firstChildByLocalName(node: Element | null, name: string): Element | null {
  if (!node) return null;
  for (const child of Array.from(node.children)) if ((child as Element).localName === name) return child as Element;
  return null;
}

export interface BankTxn {
  bank_id: number;
  IBAN: string | null;
  Amount: number;
  Ccy: string | null;
  Dir: string | null;
  BookDate: string | null;
  EndToEndId?: string | null;
  InstrId?: string | null;
  Debtor?: string | null;
  Creditor?: string | null;
  BkTxCd?: string | null;
}

export function parseCamt053(xmlText: string): { bank: BankTxn[]; opening?: { amt: number; ccy: string | null }; closing?: { amt: number; ccy: string | null }; iban: string | null } {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror");
  if (parserError && parserError.length > 0) throw new Error("Invalid XML: " + parserError[0].textContent);

  const ibanEl = Array.from(doc.getElementsByTagNameNS("*", "IBAN")).at(0) as Element | undefined;
  const iban = ibanEl ? ibanEl.textContent : null;

  let opening: { amt: number; ccy: string | null } | undefined;
  let closing: { amt: number; ccy: string | null } | undefined;
  const balEls = Array.from(doc.getElementsByTagNameNS("*", "Bal"));
  for (const bal of balEls) {
    const tp = firstChildByLocalName(bal as Element, "Tp");
    const cdOrPrtry = firstChildByLocalName(tp, "CdOrPrtry");
    const cd = firstChildByLocalName(cdOrPrtry, "Cd");
    const code = cd?.textContent ?? "";
    const amtEl = firstChildByLocalName(bal as Element, "Amt");
    const amt = amtEl ? Number(amtEl.textContent) : NaN;
    const ccy = amtEl ? amtEl.getAttribute("Ccy") : null;
    if (code === "OPBD") opening = { amt, ccy };
    if (code === "CLBD") closing = { amt, ccy };
  }

  const entries = Array.from(doc.getElementsByTagNameNS("*", "Ntry"));
  const bank: BankTxn[] = entries.map((n, idx) => {
    const amtEl = firstChildByLocalName(n as Element, "Amt");
    const amount = amtEl ? Number(amtEl.textContent) : NaN;
    const ccy = amtEl ? amtEl.getAttribute("Ccy") : null;
    const dir = firstChildByLocalName(n as Element, "CdtDbtInd")?.textContent ?? null;
    const bookDate = firstChildByLocalName(firstChildByLocalName(n as Element, "BookgDt"), "Dt")?.textContent ?? null;

    const txRefs = (n as Element).getElementsByTagNameNS("*", "Refs")[0];
    const endToEndId = txRefs?.getElementsByTagNameNS("*", "EndToEndId")[0]?.textContent ?? null;
    const instrId = txRefs?.getElementsByTagNameNS("*", "InstrId")[0]?.textContent ?? null;

    const dbtrNm = (n as Element).getElementsByTagNameNS("*", "Dbtr")[0]?.getElementsByTagNameNS("*", "Nm")[0]?.textContent ?? null;
    const cdtrNm = (n as Element).getElementsByTagNameNS("*", "Cdtr")[0]?.getElementsByTagNameNS("*", "Nm")[0]?.textContent ?? null;

    const fam = (n as Element).getElementsByTagNameNS("*", "Fmly")[0];
    const famCd = fam?.getElementsByTagNameNS("*", "Cd")[0]?.textContent ?? "";
    const famSub = fam?.getElementsByTagNameNS("*", "SubFmlyCd")[0]?.textContent ?? "";
    const bktxcd = [famCd, famSub].filter(Boolean).join("-");

    return { bank_id: idx, IBAN: iban, Amount: Number(amount), Ccy: ccy, Dir: dir, BookDate: bookDate, EndToEndId: endToEndId, InstrId: instrId, Debtor: dbtrNm, Creditor: cdtrNm, BkTxCd: bktxcd || null };
  });

  return { bank, opening, closing, iban };
}

