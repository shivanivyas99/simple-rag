declare module 'pdf-parse' {
  function PDFParser(dataBuffer: Buffer): Promise<{
    text: string;
    numpages: number;
    info: any;
  }>;
  export = PDFParser;
} 