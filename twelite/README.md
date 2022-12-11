# Okan Watcher

開閉PALのデータをオリジナルのフレームにしてUARTに出力するアプリです．

MWSDKに含まれるApp_Wingのソースコードを一部改変して作成しています．

## 依存

* [MWSDK](https://sdk.twelite.info/): 2022_08

## ビルド前準備

Okan_WatcherをMWSDKのワークスペースに追加し，依存ファイルへのシンボリックリンクを作ります．

```
# ワークスペースにこのプロジェクトを追加
ln -sf $PWD/Okan_Watcher path_to_mwsdk/Wks_TweApps/App_Wings

# 依存しているCommonのシンボリックリンクを追加
ln -sf path_to_mwsdk/Wks_TweApps/App_Wings/Common .

# App_Wingと同じものを使うファイルへのシンボリックリンクを追加
ln -sf path_to_mwsdk/Wks_TweApps/App_Wings/App_Wings/App_Wings.h Okan_Watcher
```

## ビルド

`path_to_mwstage/TWELITE_Stage.command`で起動する TWELITE STAGEで`アプリ書換＞TWELITE APPSビルド＆書換＞APP_Wings＞Okan_Watcher`を選択してビルド＆書換を実行します．

## ライセンス

MIT

改変元のソースについては，以下の使用許諾契約書を参照してください．

* MW-SLA-1J.txt: モノワイヤレスソフトウェア使用許諾契約書（日本語）
* MW-SLA-1E.txt: モノワイヤレスソフトウェア使用許諾契約書（英語）
