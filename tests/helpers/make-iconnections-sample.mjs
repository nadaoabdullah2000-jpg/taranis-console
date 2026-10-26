/* Writes tests/fixtures/iconnections-sample.xlsx: a cover sheet in front of
   the data, the column names iConnections uses, and one row for each case
   the matcher has to handle. Public institutions only.
   Run with: node tests/helpers/make-iconnections-sample.mjs */
import { writeFileSync } from 'node:fs';
import { xlsx } from './xlsx-build.mjs';

const cover = { name: 'Read Me', rows: [
  ['iConnections — allocator export'],
  ['Sample built for the Taranis console tests. The data is on the next sheet.']] };
const data = { name: 'Allocators', rows: [
  ['Firm Name', 'Website', 'AUM (USD)', 'Investor Type', 'HQ Country'],
  ['ADIA', 'adia.ae', '> $50bn', 'Sovereign Wealth Fund', 'United Arab Emirates'],                 // alias
  ['Carnegie Mellon University (CMU)', 'cmu.edu', '$2.5bn - $5bn', 'Endowment', 'United States'],  // exact after normalising
  ['CMU', 'cmu.edu', '3,000,000,000', 'Endowment', 'USA'],                                       // alias, and a second row on the same firm
  ['Texas Permanent School Fund - SBOE (PSF)', null, '$25bn - $50bn', 'Permanent Fund', 'US'],   // fuzzy
  ['Massachusetts Pension Reserves Investment Management (PRIM)', null, '$1bn - $2.5bn', 'Public Pension', 'United States'], // fuzzy + AUM conflict
  ['Utah Retirement Systems', null, null, 'Pension Fund', 'United Kingdom'],                      // country conflict
  ['Cresset Capital Mgmt', null, 1500, 'Multi-Family Office', 'United States'],                    // abbreviation
  ['KW Investment Management', null, null, 'Asset Manager', 'United States'],                     // shares only generic words with others
  [null, 'nobody.example', '$1bn', 'Family Office', 'US'],                                       // no name: reported, not sent
  ['Totally Unknown Allocator Ltd', null, '22% YoY', 'Family Office', 'Atlantis']] };            // no match; AUM and country not understood
writeFileSync(new URL('../fixtures/iconnections-sample.xlsx', import.meta.url), xlsx([cover, data]));
console.log('wrote tests/fixtures/iconnections-sample.xlsx');
