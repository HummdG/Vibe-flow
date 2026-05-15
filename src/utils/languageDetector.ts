/**
 * Language detection utility
 */

import { Language } from '../types';

const EXTENSION_MAP: Record<string, Language> = {
    '.py': 'Python',
    '.js': 'JavaScript',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript React',
    '.jsx': 'JavaScript',
    '.java': 'Java',
    '.cs': 'C#',
    '.go': 'Go',
    '.c': 'C',
    '.cpp': 'C++',
    '.cc': 'C++',
    '.cxx': 'C++',
    '.h': 'C',
    '.hpp': 'C++',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.kt': 'Kotlin',
    '.kts': 'Kotlin',
    '.swift': 'Swift'
};

export function detectLanguage(filename: string, content?: string): Language {
    const ext = filename.substring(filename.lastIndexOf('.'));
    
    // First check extension
    if (EXTENSION_MAP[ext]) {
        // Special case: .js/.ts could be React
        if (content && (ext === '.js' || ext === '.ts')) {
            if (content.includes('import React') || content.includes('from \'react\'') || content.includes('from "react"')) {
                return ext === '.js' ? 'JavaScript' : 'TypeScript React';
            }
        }
        return EXTENSION_MAP[ext];
    }
    
    return 'generic';
}

export function isSupported(language: Language): boolean {
    return language !== 'generic';
}

