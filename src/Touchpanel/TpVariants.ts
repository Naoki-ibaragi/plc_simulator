export type colorName = "red" | "green" | "blue" | "yellow";
export type buttonType = "MOMENTARY" | "NOT"; //ボタンの挙動

export type lampObj = {
    id:string, //要素を一意に識別するID
    elementType:"LAMP", //要素種別
    color:colorName, //ON時のカラー
    bitDevice:string, //関連するbitデバイス
    pointX:number, //設置座標X
    pointY:number //設置座標Y
}

export type buttonObj = {
    id:string,
    elementType:"BUTTON",
    color:colorName,
    bitDevice:string,
    buttonType:buttonType,
    pointX:number,
    pointY:number
}

export type textObj = {
    id:string,
    elementType:"TEXT",
    content:string,
    color:colorName,
    pointX:number,
    pointY:number
}

export type tpElementObj = lampObj | buttonObj | textObj;

export const createLampObj = (pointX:number, pointY:number): lampObj => ({
    id: crypto.randomUUID(),
    elementType:"LAMP",
    color:"red",
    bitDevice:"",
    pointX,
    pointY
})

export const createButtonObj = (pointX:number, pointY:number): buttonObj => ({
    id: crypto.randomUUID(),
    elementType:"BUTTON",
    color:"blue",
    bitDevice:"",
    buttonType:"MOMENTARY",
    pointX,
    pointY
})

export const createTextObj = (pointX:number, pointY:number): textObj => ({
    id: crypto.randomUUID(),
    elementType:"TEXT",
    color:"red",
    content:"",
    pointX,
    pointY
})
