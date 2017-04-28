export interface CompiledArgument {
    name: string;
    lvalue: boolean;
    rvalue: boolean;
    count: number;
}
export interface CompiledRoutine {
    body: string;
    args: CompiledArgument[];
    thisVars: string[];
    localVars: string[];
}
export declare function parse(func: string | Function): CompiledRoutine;
export default parse;
