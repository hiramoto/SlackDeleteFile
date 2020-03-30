/* 引数 */
var days = 365; // 日以上経過したら削除
var ignoreType = "spaces"; // 削除対象にしないファイル形式(spacesは通常の投稿)
var interval = 6; // 削除間隔

/* スコープを与える */
var SlackDelFileApp = {}

/* 削除処理 */
function deleteOldFile(){

  // 全てのチャンネルを取得する
  var res = SlackDelFileApp.getAllChannels("conversations.list");

  // チャンネルを1つずつ
  res.channels.forEach(function(channelData){
    var channelName = channelData.name;
    var channelId = channelData.id;

    var deleteFiles = SlackDelFileApp.getFileListWithOutOption(channelId, days, ignoreType); // 削除対象を取得

    deleteFiles.files.forEach(function(file){ // 削除
      var data = SlackDelFileApp.deleteFile(file.id);
      if (data.error){
        Logger.log('  Failed to delete file ' + file.name + ' Error: ' + data.error);
      } else {
         Logger.log('  Deleted file "' + file.name + '"(id => "' + file.id + '")');
      }
    });

    // 次回削除予定ファイルの通知
    SlackDelFileApp.postConfirm(channelName, channelId, days + 6, ignoreType)
  });
}

/* SLACKのTOKENを読み込み */
SlackDelFileApp.SLACK_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('SLACK_ACCESS_TOKEN');// slackで発行したTOKENをGASの環境変数に設定

/* soundTricker/SlackApp　を使うよりurlからAPI叩いたほうが早いらしいので */
SlackDelFileApp.execute = function(method, params){
  if (params === undefined ) params = {'token' : SlackDelFileApp.SLACK_ACCESS_TOKEN};
  var options = {
    'method': 'POST',
    'payload': params
  }
  var res = UrlFetchApp.fetch('https://slack.com/api/' + method, options);
  return JSON.parse(res.getContentText());
}

SlackDelFileApp.get = function(method, params){
  if (params === undefined ) params = {'token' : SlackDelFileApp.SLACK_ACCESS_TOKEN};
  var options = {
    'token' : SlackDelFileApp.SLACK_ACCESS_TOKEN ,
    'method': 'GET',
  }
  var res = UrlFetchApp.fetch('https://slack.com/api/' + method + '?'+ SlackDelFileApp.getAsUriParameters(params), options);
  return JSON.parse(res.getContentText());
}

SlackDelFileApp.getAsUriParameters = function(data) {
   var url = '';
   for (var prop in data) {
      url += encodeURIComponent(prop) + '=' + 
          encodeURIComponent(data[prop]) + '&';
   }
   return url.substring(0, url.length - 1)
}

/* 翌日の削除対象ファイルの確認 */
SlackDelFileApp.postConfirm = function(channelName, channelId, elapsedDaysNext, ignoreType){
  var deleteFiles = this.getFileListWithOutOption(channelId, elapsedDaysNext, ignoreType); // 翌日の削除対象を取得
  if(deleteFiles.files.length == 0) return;
  var listMsg = (interval + 1) + '日後の削除対象ファイルは以下 ' + deleteFiles.files.length + ' 件のファイルです。';
  
  deleteFiles.files.forEach(function(f){
    listMsg +=  "\n\t・" + f.name ; 
  });
  
  var params = {
    'token': SlackDelFileApp.SLACK_ACCESS_TOKEN,
    'channel': channelName,
    'username' : 'ファイル削除botくん', //投稿するbotの名前
    'text'     : listMsg //投稿するメッセージ
  }
  return this.execute('chat.postMessage', params);
}
  
/* ファイルの削除*/
SlackDelFileApp.deleteFile = function(id){
  var params = {
    'token': SlackDelFileApp.SLACK_ACCESS_TOKEN,
    'file' : id // delete対象はidで指定
  }
 return this.execute('files.delete', params);
}

/* チャネル名（グループ名）からidを取得 */
SlackDelFileApp.getId = function(name, type) { // 公開->channel 非公開->group という扱いらしいのでどちらにも対応
  if(type === undefined) type = 'channels';
  
  var channelsList
  if(type === 'channels'){
    channelsList = this.execute('channels.list').channels;
  }else if(type ==='groups'){
    channelsList = this.execute('groups.list').groups;
  }
  var channelId = '';
  channelsList.some(function(channels){
    if (channels.name.match(name)){
      channelId = channels.id;
      return true;
    } 
  });
  return channelId;
}

SlackDelFileApp.getAllChannels = function(){
  var params = {
    'token'	: SlackDelFileApp.SLACK_ACCESS_TOKEN,
    'types' : 'public_channel,private_channel,mpim,im'
  };
  return this.get('conversations.list',params);
}

/* 日付　->　秒変換　->　日時*/
SlackDelFileApp.elapsedDaysToUnixTime = function(days){  
  var date = new Date();
  var now = Math.floor(date.getTime()/ 1000); // unixtime[sec]
  return now - 8.64e4 * days + '' // 8.64e4[sec] = 1[day] 文字列じゃないと動かないので型変換している
}

/* 指定したタイプ以外のファイルを削除 */
SlackDelFileApp.getFileListWithOutOption = function(channelId, days, ignoreType, count){
  if(count === undefined) count = 1000;
  var params = {
    'token'	: SlackDelFileApp.SLACK_ACCESS_TOKEN,
    'count'	: count,
    'ts_to'	: SlackDelFileApp.elapsedDaysToUnixTime(days),
    'channel'	: channelId,
  }
  var allFiles = this.execute('files.list', params); // まず、全てのファイルを取ってくる
  
  params.types = ignoreType; // typeを指定
  var ignoreFiles = this.execute('files.list', params); // 指定した形式のファイルを取ってくる
  
  var getDiffs = function(listAll,listIgnore){
    var diffs = [];
    
    if(listAll == undefined) return diffs;
    
    listAll.forEach(function(a){
      var exist = false;
      listIgnore.forEach(function(i){
        if (a.id === i.id) exist = true;
      });
      if ( !exist ) diffs.push(a);
    });
    return diffs;
  }
  
  allFiles.files = getDiffs(allFiles.files, ignoreFiles.files) // 指定したタイプ以外のファイルを取得
  return allFiles;
}

