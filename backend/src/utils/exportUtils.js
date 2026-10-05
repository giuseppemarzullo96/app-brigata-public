/**
 * Utility per export CSV/PDF
 */

/**
 * Converte array di oggetti in CSV
 */
function arrayToCSV(data, headers) {
  if (!data || data.length === 0) {
    return '';
  }

  // Headers
  const headerRow = headers.map(h => `"${h.label}"`).join(',');
  
  // Rows
  const rows = data.map(item => {
    return headers.map(h => {
      const value = h.accessor ? h.accessor(item) : item[h.key];
      return `"${String(value || '').replace(/"/g, '""')}"`;
    }).join(',');
  });

  return [headerRow, ...rows].join('\n');
}

/**
 * Genera CSV per sondaggi
 */
function exportSondaggioCSV(sondaggio, risultati) {
  const headers = [
    { label: 'Opzione', key: 'testo_opzione' },
    { label: 'Voti', key: 'voti' },
    { label: 'Percentuale', key: 'percentuale' },
  ];

  return arrayToCSV(risultati.risultati || [], headers);
}

/**
 * Genera CSV per presenze assemblea
 */
function exportPresenzeCSV(presenze) {
  const headers = [
    { label: 'Nome', accessor: (p) => `${p.nome} ${p.cognome}` },
    { label: 'Email', key: 'email' },
    { label: 'Categoria', key: 'categoria_socio' },
    { 
      label: 'Presenza', 
      accessor: (p) => p.presenza === true ? 'Presente' : p.presenza === false ? 'Assente' : 'Non risposto'
    },
    { label: 'Data Risposta', key: 'data_risposta' },
  ];

  return arrayToCSV(presenze, headers);
}

module.exports = {
  arrayToCSV,
  exportSondaggioCSV,
  exportPresenzeCSV
};

