// A small XML reader: enough of XML for SVG files as editors write them. It keeps
// elements and their attributes and drops everything else (text, comments,
// processing instructions, the doctype), which is all an outline drawing needs.
// No DOM is used, so it works the same in a browser, in Node and in tests.

export interface XmlElement {
    // The local name, without a namespace prefix: "path" for both <path> and <svg:path>.
    readonly name: string;
    readonly attributes: ReadonlyMap<string, string>;
    readonly children: readonly XmlElement[];
}

interface OpenElement {
    readonly name: string;
    readonly attributes: Map<string, string>;
    readonly children: XmlElement[];
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function parseXmlElements(text: string): XmlElement {
    const root: OpenElement = { name: "#document", attributes: new Map(), children: [] };
    const open: OpenElement[] = [root];
    let position = 0;
    while (position < text.length) {
        const tagStart = text.indexOf("<", position);
        if (tagStart < 0) break;
        if (text.startsWith("<!--", tagStart)) {
            position = endOf(text, "-->", tagStart);
        } else if (text.startsWith("<![CDATA[", tagStart)) {
            position = endOf(text, "]]>", tagStart);
        } else if (text.startsWith("<?", tagStart)) {
            position = endOf(text, "?>", tagStart);
        } else if (text.startsWith("<!", tagStart)) {
            position = skipDeclaration(text, tagStart);
        } else if (text.startsWith("</", tagStart)) {
            const tagEnd = endOf(text, ">", tagStart);
            const name = localName(text.slice(tagStart + 2, tagEnd - 1).trim());
            // Close back to the matching element; a stray end tag closes nothing.
            const index = open.map((element) => element.name).lastIndexOf(name);
            if (index > 0) open.length = index;
            position = tagEnd;
        } else {
            position = readStartTag(text, tagStart, open);
        }
    }
    return root;
}

// The position just after `terminator`, searching from `from`; the end of the text if it never comes.
function endOf(text: string, terminator: string, from: number): number {
    const index = text.indexOf(terminator, from);
    return index < 0 ? text.length : index + terminator.length;
}

// <!DOCTYPE svg ... [ <!ENTITY ...> ]> may hold an internal subset in brackets.
function skipDeclaration(text: string, from: number): number {
    let depth = 0;
    for (let position = from + 2; position < text.length; position++) {
        const character = text[position];
        if (character === "[") depth++;
        else if (character === "]") depth--;
        else if (character === ">" && depth <= 0) return position + 1;
    }
    return text.length;
}

const ATTRIBUTE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/y;

function readStartTag(text: string, tagStart: number, open: OpenElement[]): number {
    let position = tagStart + 1;
    const nameMatch = /[^\s/>]+/y;
    nameMatch.lastIndex = position;
    const name = nameMatch.exec(text)?.[0] ?? "";
    position += name.length;
    const attributes = new Map<string, string>();
    for (;;) {
        while (position < text.length && /\s/.test(text[position])) position++;
        if (position >= text.length) break;
        if (text[position] === ">") {
            position++;
            const element: OpenElement = { name: localName(name), attributes, children: [] };
            open[open.length - 1].children.push(element);
            open.push(element);
            return position;
        }
        if (text.startsWith("/>", position)) {
            open[open.length - 1].children.push({ name: localName(name), attributes, children: [] });
            return position + 2;
        }
        ATTRIBUTE.lastIndex = position;
        const match = ATTRIBUTE.exec(text);
        if (!match) {
            // Not well formed here: skip a character and keep reading rather than giving up on the file.
            position++;
            continue;
        }
        attributes.set(match[1], decodeEntities(match[3] ?? match[4] ?? ""));
        position = ATTRIBUTE.lastIndex;
    }
    return text.length;
}

function localName(name: string): string {
    const colon = name.indexOf(":");
    return colon < 0 ? name : name.slice(colon + 1);
}

function decodeEntities(value: string): string {
    return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, entity: string) => {
        if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        return NAMED_ENTITIES[entity] ?? whole;
    });
}

// All elements below `element` (not itself), depth first, in document order.
export function* descendants(element: XmlElement): Generator<XmlElement> {
    for (const child of element.children) {
        yield child;
        yield* descendants(child);
    }
}
