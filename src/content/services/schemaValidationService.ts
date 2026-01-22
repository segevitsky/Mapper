/**
 * Schema Validation Service
 * Service for generating TypeScript schemas from JSON responses and validating API consistency
 */

// Type definitions
type PrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'undefined';
type ComplexType = 'object' | 'array' | 'union';
type SchemaType = PrimitiveType | ComplexType;

interface SchemaNode {
  type: SchemaType;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  types?: PrimitiveType[];
  optional?: boolean;
}

interface ValidationError {
  path: string;
  expected: string;
  actual: string;
  value: any;
}

interface ValidationWarning {
  path: string;
  message: string;
  value: any;
}

interface ValidationResult {
  isValid: boolean;
  hasWarnings: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    errorCount: number;
    warningCount: number;
  };
  errorMessages?: string[];
  warningMessages?: string[];
}

interface SchemaGenerationOptions {
  format?: 'multiline' | 'inline';
}

interface SchemaComparison {
  isCompatible: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  originalSchema: SchemaNode;
  newSchema: SchemaNode;
}

  // Testing functions
  type ParsedField = {
    type: string;
    optional: boolean;
  };

  type ParsedSchema = Record<string, ParsedField>;

  interface SchemaDiff {
    added: string[];
    removed: string[];
    changed: {
      field: string;
      from: ParsedField;
      to: ParsedField;
    }[];
  }

  interface DetailedChange {
    path: string;
    type: 'added' | 'removed' | 'modified';
    from?: string;
    to?: string;
  }


class SchemaValidationService {
  private schemaCache: Map<string, SchemaNode>;

  constructor() {
    this.schemaCache = new Map();
  }

  /**
   * Generate TypeScript type definition from JSON response
   * @param responseBody - JSON response body (string or object)
   * @param typeName - Name for the generated type
   * @param options - Generation options (format: 'multiline' | 'inline')
   * @returns TypeScript type definition as string
   */


    public parseTypeSchema(tsString: string): ParsedSchema {
      const obj: ParsedSchema = {};

      // Extract the type definition part: everything between = and final ;
      // Format: "type Name = { ... };" or "type Name = { ... }"
      const typeDefMatch = tsString.match(/=\s*(.+?);?\s*$/);
      if (!typeDefMatch) {
        console.warn('Could not parse type definition:', tsString);
        return obj;
      }

      let typeBody = typeDefMatch[1].trim();

      // Remove outer braces if present
      if (typeBody.startsWith('{') && typeBody.endsWith('}')) {
        typeBody = typeBody.slice(1, -1).trim();
      }

      // Parse fields - handle both with and without trailing semicolons
      // Split by semicolon but be careful with nested objects and arrays
      const fields = this.splitTypeFields(typeBody);

      for (const field of fields) {
        const trimmedField = field.trim();
        if (!trimmedField) continue;

        // Match: "fieldName?: type" or "fieldName: type"
        const fieldMatch = trimmedField.match(/^(\w+)(\?)?:\s*(.+)$/);
        if (fieldMatch) {
          const [_, key, optionalMarker, type] = fieldMatch;
          obj[key] = {
            type: type.trim(),
            optional: !!optionalMarker
          };
        }
      }

      return obj;
    }

    /**
     * Split type fields by semicolon, respecting nested braces and brackets
     */
    private splitTypeFields(typeBody: string): string[] {
      const fields: string[] = [];
      let current = '';
      let braceDepth = 0;
      let bracketDepth = 0;

      for (let i = 0; i < typeBody.length; i++) {
        const char = typeBody[i];

        if (char === '{') braceDepth++;
        else if (char === '}') braceDepth--;
        else if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth--;
        else if (char === ';' && braceDepth === 0 && bracketDepth === 0) {
          fields.push(current);
          current = '';
          continue;
        }

        current += char;
      }

      // Add the last field (might not have trailing semicolon)
      if (current.trim()) {
        fields.push(current);
      }

      return fields;
    }

    /**
     * Normalize type string for comparison (remove trailing ?, normalize whitespace)
     */
    private normalizeType(type: string): string {
      return type
        .replace(/\s*\|\s*null\s*\?/g, ' | null')  // Remove trailing ? after | null
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
    }

    /**
     * Check if two types are semantically equivalent
     */
    private areTypesEquivalent(typeA: string, typeB: string): boolean {
      const normalizedA = this.normalizeType(typeA);
      const normalizedB = this.normalizeType(typeB);
      return normalizedA === normalizedB;
    }

    /**
     * Compares two TypeScript schemas and returns added, removed, and changed fields.
     */
    public compareTypeSchemas(
      schemaStrA: string,
      schemaStrB: string,
    ): SchemaDiff {

      const schemaA = this.parseTypeSchema(schemaStrA);
      const schemaB = this.parseTypeSchema(schemaStrB);

      const added: string[] = [];
      const removed: string[] = [];
      const changed: SchemaDiff["changed"] = [];
      // Find removed or changed fields
      for (const key in schemaA) {
        if (!(key in schemaB)) {
          removed.push(key);
        } else {
          const a = schemaA[key];
          const b = schemaB[key];
          // Use normalized type comparison instead of strict equality
          if (!this.areTypesEquivalent(a.type, b.type) || a.optional !== b.optional) {
            changed.push({ field: key, from: a, to: b });
          }
        }
      }
      // Find newly added fields
      for (const key in schemaB) {
        if (!(key in schemaA)) {
          added.push(key);
        }
      }

      return { added, removed, changed };
    }

    /**
     * Recursively compare nested object types and return detailed changes
     */
    private compareNestedFields(typeA: string, typeB: string, basePath: string = ''): DetailedChange[] {
      const changes: DetailedChange[] = [];

      // Check if both are object types
      const isObjectA = typeA.trim().startsWith('{');
      const isObjectB = typeB.trim().startsWith('{');

      if (!isObjectA || !isObjectB) {
        // Not nested objects, just a type change
        // Use normalized comparison to avoid false positives
        if (!this.areTypesEquivalent(typeA, typeB)) {
          changes.push({
            path: basePath,
            type: 'modified',
            from: typeA,
            to: typeB
          });
        }
        return changes;
      }

      // Parse both object types
      const fieldsA = this.splitTypeFields(typeA.slice(1, -1).trim());
      const fieldsB = this.splitTypeFields(typeB.slice(1, -1).trim());

      const parsedA: Record<string, { type: string; optional: boolean }> = {};
      const parsedB: Record<string, { type: string; optional: boolean }> = {};

      // Parse fields A
      fieldsA.forEach(field => {
        const match = field.trim().match(/^(\w+)(\?)?:\s*(.+)$/);
        if (match) {
          const [_, key, optionalMarker, type] = match;
          parsedA[key] = { type: type.trim(), optional: !!optionalMarker };
        }
      });

      // Parse fields B
      fieldsB.forEach(field => {
        const match = field.trim().match(/^(\w+)(\?)?:\s*(.+)$/);
        if (match) {
          const [_, key, optionalMarker, type] = match;
          parsedB[key] = { type: type.trim(), optional: !!optionalMarker };
        }
      });

      // Find removed fields
      for (const key in parsedA) {
        if (!(key in parsedB)) {
          const fieldPath = basePath ? `${basePath}.${key}` : key;
          changes.push({
            path: fieldPath,
            type: 'removed',
            from: parsedA[key].type + (parsedA[key].optional ? '?' : '')
          });
        }
      }

      // Find added fields
      for (const key in parsedB) {
        if (!(key in parsedA)) {
          const fieldPath = basePath ? `${basePath}.${key}` : key;
          changes.push({
            path: fieldPath,
            type: 'added',
            to: parsedB[key].type + (parsedB[key].optional ? '?' : '')
          });
        }
      }

      // Find modified fields (recursively)
      for (const key in parsedA) {
        if (key in parsedB) {
          const fieldA = parsedA[key];
          const fieldB = parsedB[key];
          const fieldPath = basePath ? `${basePath}.${key}` : key;

          // Check if nested objects
          if (fieldA.type.trim().startsWith('{') && fieldB.type.trim().startsWith('{')) {
            // Recursively compare nested objects
            const nestedChanges = this.compareNestedFields(fieldA.type, fieldB.type, fieldPath);
            changes.push(...nestedChanges);
          } else if (!this.areTypesEquivalent(fieldA.type, fieldB.type) || fieldA.optional !== fieldB.optional) {
            // Simple type change - use normalized comparison
            changes.push({
              path: fieldPath,
              type: 'modified',
              from: fieldA.type + (fieldA.optional ? '?' : ''),
              to: fieldB.type + (fieldB.optional ? '?' : '')
            });
          }
        }
      }

      return changes;
    }

    /**
     * Generate HTML for displaying schema diff details
     */
    public generateSchemaDiffHTML(schemaDiff: SchemaDiff, schemaStrA: string, schemaStrB: string): string {
      const schemaA = this.parseTypeSchema(schemaStrA);
      const schemaB = this.parseTypeSchema(schemaStrB);

      // Collect all detailed changes (including nested ones)
      const allChanges: DetailedChange[] = [];

      // Process added fields
      schemaDiff.added.forEach(field => {
        const fieldInfo = schemaB[field];
        // Check if it's a nested object
        if (fieldInfo.type.trim().startsWith('{')) {
          // Recursively find all added nested fields
          const nestedChanges = this.compareNestedFields('{}', fieldInfo.type, field);
          allChanges.push(...nestedChanges);
        } else {
          allChanges.push({
            path: field,
            type: 'added',
            to: fieldInfo.type + (fieldInfo.optional ? '?' : '')
          });
        }
      });

      // Process removed fields
      schemaDiff.removed.forEach(field => {
        const fieldInfo = schemaA[field];
        // Check if it's a nested object
        if (fieldInfo.type.trim().startsWith('{')) {
          // Recursively find all removed nested fields
          const nestedChanges = this.compareNestedFields(fieldInfo.type, '{}', field);
          allChanges.push(...nestedChanges);
        } else {
          allChanges.push({
            path: field,
            type: 'removed',
            from: fieldInfo.type + (fieldInfo.optional ? '?' : '')
          });
        }
      });

      // Process changed fields (with recursive nested comparison)
      schemaDiff.changed.forEach(change => {
        const nestedChanges = this.compareNestedFields(change.from.type, change.to.type, change.field);
        allChanges.push(...nestedChanges);
      });

      // Group changes by type
      const added = allChanges.filter(c => c.type === 'added');
      const removed = allChanges.filter(c => c.type === 'removed');
      const modified = allChanges.filter(c => c.type === 'modified');

      let html = '<div style="text-align: left; font-family: monospace; font-size: 13px; max-height: 400px; overflow-y: auto;">';

      // Added fields
      if (added.length > 0) {
        html += '<div style="margin-bottom: 20px;">';
        html += '<div style="font-weight: bold; color: #4CAF50; margin-bottom: 8px;">✅ Added Fields (' + added.length + '):</div>';
        html += '<ul style="margin: 0; padding-left: 20px; list-style: none;">';
        added.forEach(change => {
          html += `<li style="margin: 4px 0; color: #2e7d32;">+ <strong>${change.path}</strong>: ${change.to}</li>`;
        });
        html += '</ul></div>';
      }

      // Removed fields
      if (removed.length > 0) {
        html += '<div style="margin-bottom: 20px;">';
        html += '<div style="font-weight: bold; color: #f44336; margin-bottom: 8px;">❌ Removed Fields (' + removed.length + '):</div>';
        html += '<ul style="margin: 0; padding-left: 20px; list-style: none;">';
        removed.forEach(change => {
          html += `<li style="margin: 4px 0; color: #c62828;">- <strong>${change.path}</strong>: ${change.from}</li>`;
        });
        html += '</ul></div>';
      }

      // Modified fields
      if (modified.length > 0) {
        html += '<div style="margin-bottom: 20px;">';
        html += '<div style="font-weight: bold; color: #ff9800; margin-bottom: 8px;">⚠️ Modified Fields (' + modified.length + '):</div>';
        html += '<ul style="margin: 0; padding-left: 20px; list-style: none;">';
        modified.forEach(change => {
          html += `<li style="margin: 4px 0; color: #e65100;">`;
          html += `~ <strong>${change.path}</strong>: `;
          html += `<span style="text-decoration: line-through; color: #999;">${change.from}</span>`;
          html += ` → `;
          html += `<span style="color: #ff9800;">${change.to}</span>`;
          html += `</li>`;
        });
        html += '</ul></div>';
      }

      // No changes
      if (allChanges.length === 0) {
        html += '<div style="color: #4CAF50; text-align: center; padding: 20px;">✅ Schema is identical - no changes detected</div>';
      }

      html += '</div>';
      return html;
    }



  public generateTypeDefinition(
    responseBody: any,
    typeName: string,
    options: SchemaGenerationOptions = {}
  ): string {
    try {
      const data = this.parseResponseBody(responseBody);
      const schema = this.generateSchema(data);
      
      // Cache the schema for future validations
      this.schemaCache.set(typeName, schema);
      
      const format = options.format || 'multiline';
      const typeDefinition = format === 'inline' 
        ? this.schemaToTypeScriptInline(schema)
        : this.schemaToTypeScript(schema);
      
      return `type ${typeName} = ${typeDefinition};`;
    } catch (error: any) {
      throw new Error(`Failed to generate type definition: ${error.message}`);
    }
  }

  /**
   * Validate response against existing schema
   * @param newResponseBody - New response to validate
   * @param originalResponseBody - Original response to compare against
   * @returns Validation result with errors and warnings
   */
  public validateResponse(
    newResponseBody: any,
    originalResponseBody: any
  ): ValidationResult {
    try {
      const newData = this.parseResponseBody(newResponseBody);
      const originalData = this.parseResponseBody(originalResponseBody);
      
      const originalSchema = this.generateSchema(originalData);
      return this.performValidation(newData, originalSchema);
    } catch (error: any) {
      return {
        isValid: false,
        hasWarnings: false,
        errors: [{
          path: 'root',
          expected: 'valid JSON',
          actual: 'error',
          value: error.message
        }],
        warnings: [],
        summary: {
          errorCount: 1,
          warningCount: 0
        }
      };
    }
  }

  /**
   * Validate response against cached schema
   * @param responseBody - Response to validate
   * @param schemaName - Name of cached schema
   * @returns Validation result
   */
  public validateAgainstCachedSchema(
    responseBody: any,
    schemaName: string
  ): ValidationResult {
    const cachedSchema = this.schemaCache.get(schemaName);
    if (!cachedSchema) {
      throw new Error(`No cached schema found for: ${schemaName}`);
    }

    const data = this.parseResponseBody(responseBody);
    return this.performValidation(data, cachedSchema);
  }

  /**
   * Compare two schemas for compatibility
   * @param response1 - First response
   * @param response2 - Second response
   * @returns Comparison result
   */
  public compareSchemas(response1: any, response2: any): SchemaComparison {
    const data1 = this.parseResponseBody(response1);
    const data2 = this.parseResponseBody(response2);
    
    const schema1 = this.generateSchema(data1);
    const schema2 = this.generateSchema(data2);
    
    const validation = this.validateAgainstSchema(data2, schema1);
    
    return {
      isCompatible: validation.errors.length === 0,
      errors: validation.errors,
      warnings: validation.warnings,
      originalSchema: schema1,
      newSchema: schema2
    };
  }

  /**
   * Get cached schema
   * @param schemaName - Name of schema to retrieve
   * @returns Cached schema or undefined
   */
  public getCachedSchema(schemaName: string): SchemaNode | undefined {
    return this.schemaCache.get(schemaName);
  }

  /**
   * Clear schema cache
   */
  public clearCache(): void {
    this.schemaCache.clear();
  }

  /**
   * Get all cached schema names
   * @returns Array of cached schema names
   */
  public getCachedSchemaNames(): string[] {
    return Array.from(this.schemaCache.keys());
  }

  // Private helper methods

  private parseResponseBody(responseBody: any): any {
    if (typeof responseBody === 'string') {
      return JSON.parse(responseBody);
    }
    return responseBody;
  }

  private getType(value: any): SchemaType {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value as SchemaType;
  }

  private generateSchema(value: any): SchemaNode {
    const type = this.getType(value);
    const schema: SchemaNode = { type };

    if (type === 'object' && value !== null) {
      schema.properties = {};
      for (const [key, val] of Object.entries(value)) {
        schema.properties[key] = this.generateSchema(val);
      }
    } else if (type === 'array' && Array.isArray(value)) {
      if (value.length > 0) {
        let itemSchema = this.generateSchema(value[0]);
        for (let i = 1; i < value.length; i++) {
          itemSchema = this.mergeSchemaNodes(itemSchema, this.generateSchema(value[i]));
        }
        schema.items = itemSchema;
      } else {
        schema.items = { type: 'object', properties: {} };
      }
    }

    return schema;
  }

  private mergeSchemaNodes(node1: SchemaNode, node2: SchemaNode): SchemaNode {
    // Handle null values by treating them as optional
    if (node1.type === 'null' && node2.type !== 'null') {
      return { ...node2, optional: true };
    }
    if (node2.type === 'null' && node1.type !== 'null') {
      return { ...node1, optional: true };
    }
    
    // Handle type mismatches
    if (node1.type !== node2.type) {
      if (node1.type === 'undefined') return node2;
      if (node2.type === 'undefined') return node1;
      
      // Create union type
      return {
        type: 'union',
        types: [node1.type as PrimitiveType, node2.type as PrimitiveType],
        optional: node1.optional || node2.optional
      };
    }

    const merged: SchemaNode = { type: node1.type };
    
    // Preserve optional flag
    if (node1.optional || node2.optional) {
      merged.optional = true;
    }

    // Merge object properties
    if (node1.type === 'object' && node1.properties && node2.properties) {
      merged.properties = {};
      const allKeys = new Set([
        ...Object.keys(node1.properties),
        ...Object.keys(node2.properties)
      ]);

      for (const key of allKeys) {
        if (node1.properties[key] && node2.properties[key]) {
          merged.properties[key] = this.mergeSchemaNodes(
            node1.properties[key],
            node2.properties[key]
          );
        } else if (node1.properties[key]) {
          merged.properties[key] = { ...node1.properties[key], optional: true };
        } else if (node2.properties[key]) {
          merged.properties[key] = { ...node2.properties[key], optional: true };
        }
      }
    } else if (node1.properties) {
      merged.properties = node1.properties;
    } else if (node2.properties) {
      merged.properties = node2.properties;
    }

    // Merge array items
    if (node1.type === 'array' && node1.items && node2.items) {
      merged.items = this.mergeSchemaNodes(node1.items, node2.items);
    } else if (node1.items) {
      merged.items = node1.items;
    } else if (node2.items) {
      merged.items = node2.items;
    }

    return merged;
  }

  private schemaToTypeScript(schema: SchemaNode, indent: number = 0): string {
    const spaces = ' '.repeat(indent);
    
    if (schema.type === 'union' && schema.types) {
      const types = schema.types.map(t => this.primitiveToTypeScript(t));
      return types.join(' | ');
    }
    
    switch (schema.type) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'null':
      case 'undefined':
        return this.primitiveToTypeScript(schema.type);
      
      case 'array':
        if (schema.items) {
          return `${this.schemaToTypeScript(schema.items, indent)}[]`;
        }
        return 'any[]';
      
      case 'object':
        if (!schema.properties || Object.keys(schema.properties).length === 0) {
          return '{}';
        }
        
        const props = Object.entries(schema.properties)
          .map(([key, value]) => {
            const optional = value.optional ? '?' : '';
            const propType = this.schemaToTypeScript(value, indent + 2);
            const finalType = value.optional && value.type !== 'null' && value.type !== 'union' 
              ? `${propType} | null` 
              : propType;
            return `${spaces}  ${key}${optional}: ${finalType};`;
          })
          .join('\n');
        
        return `{\n${props}\n${spaces}}`;
      
      default:
        return 'any';
    }
  }

  private schemaToTypeScriptInline(schema: SchemaNode): string {
    if (schema.type === 'union' && schema.types) {
      const types = schema.types.map(t => this.primitiveToTypeScript(t));
      return types.join(' | ');
    }
    
    switch (schema.type) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'null':
      case 'undefined':
        return this.primitiveToTypeScript(schema.type);
      
      case 'array':
        if (schema.items) {
          return `${this.schemaToTypeScriptInline(schema.items)}[]`;
        }
        return 'any[]';
      
      case 'object':
        if (!schema.properties || Object.keys(schema.properties).length === 0) {
          return '{}';
        }
        
        const props = Object.entries(schema.properties)
          .map(([key, value]) => {
            const optional = value.optional ? '?' : '';
            const propType = this.schemaToTypeScriptInline(value);
            const finalType = value.optional && value.type !== 'null' && value.type !== 'union' 
              ? `${propType} | null` 
              : propType;
            return `${key}${optional}: ${finalType}`;
          })
          .join('; ');
        
        return `{ ${props} }`;
      
      default:
        return 'any';
    }
  }

  private primitiveToTypeScript(type: PrimitiveType): string {
    return type;
  }

  public performValidation(data: any, schema: SchemaNode): ValidationResult {
    const validation = this.validateAgainstSchema(data, schema);
    
    const result: ValidationResult = {
      isValid: validation.errors.length === 0,
      hasWarnings: validation.warnings.length > 0,
      errors: validation.errors,
      warnings: validation.warnings,
      summary: {
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      }
    };
    
    if (validation.errors.length > 0) {
      result.errorMessages = validation.errors.map(err => 
        `Error at ${err.path}: expected ${err.expected}, got ${err.actual}`
      );
    }
    
    if (validation.warnings.length > 0) {
      result.warningMessages = validation.warnings.map(warn => 
        `Warning at ${warn.path}: ${warn.message}`
      );
    }
    
    return result;
  }

  public validateAgainstSchema(
    data: any, 
    schema: SchemaNode, 
    path: string = ''
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    const dataType = this.getType(data);
    
    // Check union types
    if (schema.type === 'union' && schema.types) {
      if (!schema.types.includes(dataType as PrimitiveType)) {
        errors.push({
          path,
          expected: schema.types.join(' | '),
          actual: dataType,
          value: data
        });
      }
      return { errors, warnings };
    }
    
    // Handle null values for optional fields
    if (dataType === 'null' && schema.optional) {
      return { errors, warnings };
    }
    
    // Type mismatch
    if (dataType !== schema.type && !(dataType === 'null' && schema.optional)) {
      errors.push({
        path,
        expected: schema.optional ? `${schema.type} | null` : schema.type,
        actual: dataType,
        value: data
      });
      return { errors, warnings };
    }
    
    // Validate object properties
    if (schema.type === 'object' && schema.properties) {
      const dataKeys = new Set(Object.keys(data || {}));
      const schemaKeys = new Set(Object.keys(schema.properties));
      
      // Check for missing required fields
      for (const key of schemaKeys) {
        const fieldSchema = schema.properties[key];
        if (!fieldSchema.optional && !dataKeys.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            expected: fieldSchema.type,
            actual: 'missing',
            value: undefined
          });
        }
      }
      
      // Check for extra fields
      for (const key of dataKeys) {
        if (!schemaKeys.has(key)) {
          warnings.push({
            path: path ? `${path}.${key}` : key,
            message: 'Extra field not in schema',
            value: data[key]
          });
        }
      }
      
      // Validate each property
      for (const key of dataKeys) {
        if (schema.properties[key]) {
          const fieldPath = path ? `${path}.${key}` : key;
          const result = this.validateAgainstSchema(
            data[key], 
            schema.properties[key], 
            fieldPath
          );
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        }
      }
    }
    
    // Validate array items
    if (schema.type === 'array' && schema.items && Array.isArray(data)) {
      data.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        const result = this.validateAgainstSchema(item, schema.items!, itemPath);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
    
    return { errors, warnings };
  }
}

// Export for use in browser extension
export default SchemaValidationService;

// For direct browser usage (without module system)
if (typeof window !== 'undefined') {
  (window as any).SchemaValidationService = SchemaValidationService;
}