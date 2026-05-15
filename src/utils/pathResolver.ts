/**
 * Path resolution utilities for different languages
 */

import * as path from 'path';

export class PathResolver {
    private workspaceRoot: string;
    private fileMap: Map<string, string>; // normalized path -> actual path

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.fileMap = new Map();
    }

    /**
     * Register a file in the resolver
     */
    registerFile(filePath: string): void {
        const normalized = this.normalizePath(filePath);
        this.fileMap.set(normalized, filePath);
    }

    /**
     * Normalize a path (convert to forward slashes, remove extension variations)
     */
    normalizePath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }

    /**
     * Resolve a JavaScript/TypeScript import
     */
    resolveJavaScriptImport(importPath: string, currentFile: string): string | null {
        if (importPath.startsWith('.')) {
            // Relative import
            const currentDir = path.dirname(currentFile);
            const resolved = path.join(currentDir, importPath);
            return this.findFileWithExtensions(resolved, ['.ts', '.tsx', '.js', '.jsx', '']);
        } else if (importPath.startsWith('/')) {
            // Absolute from root
            return this.findFileWithExtensions(importPath, ['.ts', '.tsx', '.js', '.jsx', '']);
        }
        // External package - return null
        return null;
    }

    /**
     * Resolve a Python import
     */
    resolvePythonImport(importPath: string, currentFile: string): string | null {
        if (importPath.startsWith('.')) {
            // Relative import
            const currentDir = path.dirname(currentFile);
            const dotCount = importPath.match(/^\.+/)?.[0].length || 0;
            
            let resolvedDir = currentDir;
            for (let i = 1; i < dotCount; i++) {
                resolvedDir = path.dirname(resolvedDir);
            }
            
            const modulePart = importPath.substring(dotCount);
            if (modulePart) {
                const modulePath = modulePart.replace(/\./g, '/');
                const resolved = path.join(resolvedDir, modulePath);
                return this.findFileWithExtensions(resolved, ['.py', '/__init__.py', '']);
            } else {
                return this.findFileWithExtensions(path.join(resolvedDir, '__init__'), ['.py', '']);
            }
        } else {
            // Absolute import from workspace root
            const modulePath = importPath.replace(/\./g, '/');
            return this.findFileWithExtensions(modulePath, ['.py', '/__init__.py', '']);
        }
    }

    /**
     * Resolve a Java import
     */
    resolveJavaImport(importPath: string): string | null {
        // Convert package.name to package/name.java
        const filePath = importPath.replace(/\./g, '/') + '.java';
        return this.findFileWithExtensions(filePath, ['']);
    }

    /**
     * Resolve a Go import
     */
    resolveGoImport(importPath: string): string | null {
        // Go imports are typically package paths
        if (importPath.startsWith('.')) {
            return this.findFileWithExtensions(importPath, ['.go', '']);
        }
        // External package
        return null;
    }

    /**
     * Resolve a Rust import (use statement)
     */
    resolveRustImport(importPath: string, currentFile: string): string | null {
        // Rust uses :: as separator
        const parts = importPath.split('::');
        
        if (parts[0] === 'crate') {
            // Crate-relative path
            const modulePath = parts.slice(1).join('/');
            return this.findFileWithExtensions(modulePath, ['.rs', '/mod.rs', '']);
        } else if (parts[0] === 'super') {
            // Parent module
            const currentDir = path.dirname(currentFile);
            const parentDir = path.dirname(currentDir);
            const modulePath = parts.slice(1).join('/');
            return this.findFileWithExtensions(path.join(parentDir, modulePath), ['.rs', '/mod.rs', '']);
        } else if (parts[0] === 'self') {
            // Current module
            const currentDir = path.dirname(currentFile);
            const modulePath = parts.slice(1).join('/');
            return this.findFileWithExtensions(path.join(currentDir, modulePath), ['.rs', '']);
        }
        
        // External crate
        return null;
    }

    /**
     * Resolve a C# using statement
     */
    resolveCSharpImport(importPath: string): string | null {
        // Convert namespace to path: System.IO -> System/IO.cs
        const filePath = importPath.replace(/\./g, '/') + '.cs';
        return this.findFileWithExtensions(filePath, ['']);
    }

    /**
     * Resolve a PHP import
     */
    resolvePHPImport(importPath: string, currentFile: string): string | null {
        if (importPath.startsWith('.')) {
            // Relative path
            const currentDir = path.dirname(currentFile);
            const resolved = path.join(currentDir, importPath);
            return this.findFileWithExtensions(resolved, ['.php', '']);
        }
        // For namespaces, convert to file path
        const filePath = importPath.replace(/\\/g, '/') + '.php';
        return this.findFileWithExtensions(filePath, ['']);
    }

    /**
     * Find a file with various extensions
     */
    private findFileWithExtensions(basePath: string, extensions: string[]): string | null {
        const normalized = this.normalizePath(basePath);
        
        for (const ext of extensions) {
            const testPath = normalized + ext;
            if (this.fileMap.has(testPath)) {
                return this.fileMap.get(testPath)!;
            }
            
            // Also check with index files
            if (ext === '') {
                const indexVariations = ['/index.ts', '/index.js', '/index.tsx', '/index.jsx'];
                for (const indexExt of indexVariations) {
                    const indexPath = normalized + indexExt;
                    if (this.fileMap.has(indexPath)) {
                        return this.fileMap.get(indexPath)!;
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Get relative path from workspace root
     */
    getRelativePath(filePath: string): string {
        const normalized = this.normalizePath(filePath);
        const workspaceNormalized = this.normalizePath(this.workspaceRoot);
        
        if (normalized.startsWith(workspaceNormalized)) {
            return normalized.substring(workspaceNormalized.length).replace(/^\//, '');
        }
        
        return normalized;
    }
}

