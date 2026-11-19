export interface PublicMessage {
  type:string;
  source:string;
  title:string;
  body:string;
  sourceSeq:number;
  storyTime?:string;
}
export interface PublicMessageDraft extends PublicMessage {medium:string}
export interface PublicMessageRef {medium:string;recordId:string;count:number;throughSeq:number;batchKey?:string;publishedAt?:number}
export interface PublicMessageRecord {recordId:string;entries:PublicMessage[]}
export interface SmellSchedule {everyReplies:number;enabledAfter:number|null}
export const defaultSmellSchedule:SmellSchedule={everyReplies:5,enabledAfter:null};

export const publicMessagesPerWindow=4;
export const smellFolders=['传闻','纸媒','广播','公告','专题','副刊'] as const;
function field(value:unknown,max:number) {
  return typeof value==='string'&&value.trim().length<=max?value.trim():'';
}
export function publicMedium(value:unknown) {
  const medium=field(value,20).normalize('NFKC');
  return /^[\p{L}\p{N}][\p{L}\p{N} -]{0,19}$/u.test(medium)?medium:'';
}

/** Correct a newly generated folder using the publication format, without touching archived records. */
export function smellPublicationFolder(value:unknown,type:string) {
  const medium=publicMedium(value);
  if(/怪谈文学|怪谈连载|小报连载|连载小说|市井短篇|民间故事|民间寓言|文艺副刊/u.test(type))return '副刊';
  if(/专题|特稿|公开专访|公共纪事|地方纪事|行业观察/u.test(type))return '专题';
  if(/便签|便条|告示|布告|公告|公示|通告|海报|启事|传单|通知/u.test(type))return '公告';
  return medium;
}

/** Only folder metadata is in the ID. The report itself is stored under that ID. */
export function smellRecordRef(recordId:string):PublicMessageRef|null {
  const match=/^smell~([1-9]\d{0,15})~([a-z0-9]{1,12})~([a-z0-9-]{1,48})~([1-4])~(.+)$/u.exec(recordId);
  if(!match)return null;
  const throughSeq=Number(match[1]),publishedAt=parseInt(match[2]!,36),medium=publicMedium(match[5]);
  if(!Number.isSafeInteger(throughSeq)||!Number.isSafeInteger(publishedAt)||!medium||medium!==match[5])return null;
  return {medium,recordId,count:Number(match[4]),throughSeq,batchKey:match[2]+'~'+match[3],publishedAt};
}
export function readPublicMessage(value:unknown):PublicMessage|undefined {
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const row=value as Partial<PublicMessage>;
  const type=field(row.type,36),source=field(row.source,80),title=field(row.title,100),body=field(row.body,1000);
  const storyTime=field(row.storyTime,100);
  if(!type||!source||!title||!body||typeof row.sourceSeq!=='number'||!Number.isSafeInteger(row.sourceSeq)||row.sourceSeq<1)return;
  return {type,source,title,body,sourceSeq:row.sourceSeq,...(storyTime?{storyTime}:{})};
}
export function publicMessageRefs(value:unknown):PublicMessageRef[] {
  const seen=new Set<string>();
  return (Array.isArray(value)?value:[]).flatMap(row=>{
    const medium=publicMedium(row?.medium),id=row?.recordId;
    if(!medium||typeof id!=='string'||!/^media-[a-z0-9-]{1,90}$/iu.test(id)||seen.has(id)
      ||!Number.isSafeInteger(row.count)||row.count<1||row.count>publicMessagesPerWindow
      ||!Number.isSafeInteger(row.throughSeq)||row.throughSeq<1)return [];
    seen.add(id);
    return [{medium,recordId:id,count:row.count,throughSeq:row.throughSeq}];
  });
}
