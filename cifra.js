#!/usr/bin/env node
/*
 * Cifra i dati riservati dell'invito e li inserisce in index.html.
 *
 * Uso:  node cifra.js
 *
 * Legge dati-privati.json (che NON va mai pubblicato) e riscrive il blocco
 * cifrato dentro index.html. Va rilanciato ogni volta che cambi i dati o la chiave.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const F_DATI = path.join(__dirname, 'dati-privati.json');
const F_HTML = path.join(__dirname, 'index.html');
const ITERAZIONI = 200000;

function fine(msg) { console.error('\nERRORE: ' + msg + '\n'); process.exit(1); }

// Stessa normalizzazione usata dalla pagina: maiuscole e spazi doppi non contano
function normChiave(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function generaChiave() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789'; // senza caratteri ambigui (i, l, o, 0, 1)
  let out = '';
  while (out.length < 16) {
    const b = crypto.randomBytes(1)[0];
    if (b < alfabeto.length * 8) out += alfabeto[b % alfabeto.length];
  }
  return out.match(/.{4}/g).join('-');
}

if (!fs.existsSync(F_DATI)) fine('manca dati-privati.json');
let dati;
try { dati = JSON.parse(fs.readFileSync(F_DATI, 'utf8')); }
catch (e) { fine('dati-privati.json non è un JSON valido: ' + e.message); }

['data', 'luogo', 'indirizzo', 'programma', 'rispostaEntro', 'whatsapp'].forEach((k) => {
  if (!dati[k]) fine('in dati-privati.json manca il campo "' + k + '"');
});
if (!/^\d{8,15}$/.test(String(dati.whatsapp))) {
  console.warn('ATTENZIONE: "whatsapp" deve contenere solo cifre con il prefisso (es. 393331234567). Ora vale: ' + dati.whatsapp);
}

if (!normChiave(dati.chiave)) {
  dati.chiave = generaChiave();
  fs.writeFileSync(F_DATI, JSON.stringify(dati, null, 2) + '\n');
  console.log('Nessuna chiave trovata: ne ho generata una e l\'ho salvata in dati-privati.json');
}
const chiave = normChiave(dati.chiave);
if (chiave.length < 12) {
  console.warn('ATTENZIONE: la chiave è corta. Il file cifrato è pubblico, usa almeno 12 caratteri o 4 parole.');
}

const segreti = Object.assign({}, dati);
delete segreti.chiave;

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(chiave, salt, ITERAZIONI, 32, 'sha256');
const cifra = crypto.createCipheriv('aes-256-gcm', key, iv);
const testo = Buffer.concat([cifra.update(JSON.stringify(segreti), 'utf8'), cifra.final(), cifra.getAuthTag()]);

const blocco = {
  s: salt.toString('base64'),
  i: iv.toString('base64'),
  d: testo.toString('base64'),
  n: ITERAZIONI
};

const html = fs.readFileSync(F_HTML, 'utf8');
const re = /(\/\* CIFRATO:INIZIO[^\n]*\*\/\n)[\s\S]*?(\n\/\* CIFRATO:FINE \*\/)/;
if (!re.test(html)) fine('non trovo i segnaposto CIFRATO:INIZIO / CIFRATO:FINE in index.html');
fs.writeFileSync(F_HTML, html.replace(re, (m, a, b) => a + 'var SEGRETO = ' + JSON.stringify(blocco) + ';' + b));

console.log('\nFatto: index.html contiene i dati cifrati.');
console.log('La chiave è in dati-privati.json. Il link per un ospite ha questa forma:');
console.log('  https://TUO-SITO/?ospite=Nome#' + encodeURIComponent(chiave) + '\n');
