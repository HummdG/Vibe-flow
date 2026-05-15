/**
 * Unique ID generator for symbols
 */

export class IdGenerator {
    private counter = 0;
    private fileCounter = new Map<string, number>();

    /**
     * Generate a unique ID for a symbol
     */
    generateSymbolId(file: string, name: string, kind: string, line: number): string {
        // Create human-readable ID: file:kind:name:line
        const cleanFile = file.replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
        return `${cleanFile}:${kind}:${name}:${line}`;
    }

    /**
     * Generate a unique ID for a file
     */
    generateFileId(file: string): string {
        const cleanFile = file.replace(/\\/g, '/');
        const count = this.fileCounter.get(cleanFile) || 0;
        this.fileCounter.set(cleanFile, count + 1);
        
        if (count === 0) {
            return cleanFile;
        }
        return `${cleanFile}#${count}`;
    }

    /**
     * Reset the generator
     */
    reset(): void {
        this.counter = 0;
        this.fileCounter.clear();
    }
}

