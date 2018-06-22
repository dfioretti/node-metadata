const fs = require('fs');
import Papa from 'papaparse';

/**
 * CsvParser for processing CSV files.
 * @class
 */
class CsvParser {
    constructor(fileName) {
        this._fileName = fileName;
        this._data = [];
    }

    /**
     * Reads and processes the CSV file.
     *
     * @returns {Array} the processed data.
     */
    async processCsvR() {
        const file = fs.readFileSync(this._fileName, 'utf8');
        const input = Papa.parse(file, {
          header: true, complete: function(results) {
            console.log('results', results, results.data);
            return results.data;
          }
        });

        return input._data;

    }
  async processCsv() {
    const file = fs.readFileSync(this._fileName, 'utf8');
    const d = Papa.parse(file, { header: true, complete: function(res) {
        return res.data;
      }});
    //console.log('d', d.data);
    return d.data;

  }
    /**
     * Get the data processed.
     *
     * @returns {Array} the processed data.
     */
    getData() {
        return this._data;
    }
}

export default CsvParser;