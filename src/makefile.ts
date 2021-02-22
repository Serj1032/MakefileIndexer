import * as fs from "fs";
import * as vscode from "vscode";
import * as path from "path";
import { connected } from "process";
import { pathToFileURL } from "url";
import { ThemeColor } from "vscode";
import { exec } from "child_process";

// https://www.gnu.org/software/make/manual/make.html#Reference

export class Makefile {
    private path: string = "";
    private variables: Map<string, Variable[]> = new Map();

    public constructor(path: string | undefined) {

        if (path != undefined) {
            this.path = path;
            this.startIndex();
        }
    }

    private readFileLines(): string[] {
        let res: string = "";
        if (fs.existsSync(this.path)) {
            let content = fs.readFileSync(this.path, 'utf8');
            let regexp = /#.*$/gm;
            res = content.replace(regexp, "");  // удалим все комментарии
        }
        let lines = res.split(/\r?\n/gm);

        // Обработаем все переносы строк. Построчно, чтобы сохранить число строк и не сбивать индексер
        let regexpNewLine = /\\\s*/gm;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (regexpNewLine.test(lines[i])) {
                let nextLine = /\b(.*)/g.exec(lines[i + 1]);
                if (nextLine)
                    lines[i] = lines[i].replace(regexpNewLine, nextLine[1]);
                regexpNewLine.lastIndex = 0;
                lines[i + 1] = lines[i + 1].replace(/.*/g, "");
            }
        }

        return lines;
    }

    private startIndex() {
        const regExpVar = /.*=.*/g;
        const regExpImport = /include (.+)/g;

        const lines = this.readFileLines();

        for (let l = 0; l < lines.length; l++) {

            console.log(lines[l]);

            if (lines[l].length == 0)
                continue;

            if (regExpVar.test(lines[l])) {     // если строка содержит определение перемеенной
                this.addVariable(lines[l], l);
            }
            else if (regExpImport.test(lines[l])) { // если строка содержит include другого makefile
                console.log("Found import other makefile: " + lines[l]);
            }

            regExpImport.lastIndex = 0;
            regExpVar.lastIndex = 0;
        }

    }

    private addVariable(line: string, line_idx: number) {
        const regexp = /(\w+)\s*([:+?]?)=(.*)/g;
        let res = regexp.exec(line);

        if (res != null) {
            let name: string = res[1];
            let type: string = res[2];
            let value: string = res[3];
            let v = new Variable(name, type, value, this.path, line_idx, res.index);

            if (!this.variables.has(name)) {
                this.variables.set(name, new Array());
            }
            this.variables.get(name)?.push(v);
        }

        regexp.lastIndex = 0;
    }

    public getDefinition(variable: string): vscode.ProviderResult<vscode.Definition> {

        let items = this.variables.get(variable);
        if (items) {
            if (items.length == 1) {
                return items[0].getVscodeLocation();
            }
            else if (items.length > 1) {
                let res: vscode.Location[] = new Array();
                items.forEach(element => res.push(element.getVscodeLocation()));
                return res;
            }
        }
        return null;
    }

    public getHover(variable: string, vsPosition: vscode.Position, doc: vscode.TextDocument): vscode.ProviderResult<vscode.Hover> {
        let items = this.variables.get(variable);
        let md = new vscode.MarkdownString();
        md.appendCodeblock(variable, "Makefile");
        md.appendText("expands to:");

        if (items) {
            let res = this.extractValueOfVariable(variable, doc.uri.path, vsPosition.line);
            /*
            for (let i = 0; i < items.length; i++) {
                if (items[i].file == doc.uri.path && items[i].line >= vsPosition.line)
                    break;

                res += items[i].getValue();
            }
            */
            md.appendCodeblock(res, "Makefile");
            return new vscode.Hover(md);
        }


        return null;
    }

    private extractValueOfVariable(variable: string, file: string, line: number): string {
        let items = this.variables.get(variable);

        if (items) {
            let i = 0;
            for (; i < items.length; i++) {
                if (items[i].line >= line) {
                    break;
                }
            }
            i--;

            if (i < 0) return "";


            let values = items[i].getValue();

            let regexpInnerVars = /\$[{\(](\w+)[\)}]/g;
            // Проверим, содержатся ли внутренние переменные
            if (regexpInnerVars.test(values)) {
                regexpInnerVars.lastIndex = 0;
                let regexpRes = regexpInnerVars.exec(values);
                while (regexpRes) {
                    let extracted = this.extractValueOfVariable(regexpRes[1], items[i].file, items[i].line);
                    values = values.replace(regexpRes[0], extracted);

                    regexpRes = regexpInnerVars.exec(values);
                }
                regexpInnerVars.lastIndex = 0;

            }

            return values;
        }

        return "";
    }

    public testExec(path: string) {
        exec("ls -la", (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
    }
}

export class Variable {

    /* Типы переменных
    1. Substitution References 
        foo := a.o b.o l.a c.o
        bar := $(foo:.o=.c)
        расщирится в bar = a.c b. l.c c.c
    2.
    */
    public readonly name: string;
    public readonly type: string;
    public readonly file: string;
    public readonly line: number;
    public readonly position: number;
    public readonly value: string;

    public constructor(name: string, type: string, value: string, file: string, line: number, position: number) {
        this.file = file;
        this.name = name;
        this.type = type;
        this.line = line;
        this.position = position;
        this.value = value.trimStart();

        // this.parseValue(value);

        // console.log("Found variable: " + this.name + " at " + this.file + " line: " + this.line + " position: " + this.position);
    }

    public parseValue(values: string) {
        // let regexp = /(\S+)/gm;
        // let regexp = /\b(.*)/g;
        // let res = regexp.exec(values);

        // while (res != null) {
        //     this.values.push(res[1]);
        //     res = regexp.exec(values);
        // }
    }

    public getValue(): string {
        // let res = "";
        // this.values.forEach(element => {
        //     res += element + " ";
        // });

        // return res.trim();
        return this.value;
    }

    public getVscodeLocation(): vscode.Location {
        let from = new vscode.Position(this.line, this.position);
        let to = new vscode.Position(this.line, this.position + this.name.length);

        return new vscode.Location(vscode.Uri.file(this.file), new vscode.Range(from, to));
    }
}
