/* Copyright (C) 2020 Mono Wireless Inc. All Rights Reserved.    *
 * Released under MW-SLA-*J,*E (MONO WIRELESS SOFTWARE LICENSE   *
 * AGREEMENT).                                                   */

/****************************************************************************/
/***        Include files                                                 ***/
/****************************************************************************/
#include "App_Wings.h"
#include "App_PAL.h"

#include "ccitt8.h"
#include "Interrupt.h"

#include "utils.h"

#include "common.h"
#include "config.h"

// Serial options
#include <serial.h>

/****************************************************************************/
/***        ToCoNet Definitions                                           ***/
/****************************************************************************/
// Select Modules (define befor include "ToCoNet.h")
#define ToCoNet_USE_MOD_TXRXQUEUE_BIG
#define ToCoNet_USE_MOD_CHANNEL_MGR
#define ToCoNet_USE_MOD_NWK_LAYERTREE // Network definition
#define ToCoNet_USE_MOD_NBSCAN // Neighbour scan module
#define ToCoNet_USE_MOD_NBSCAN_SLAVE // Neighbour scan slave module
#define ToCoNet_USE_MOD_DUPCHK

/****************************************************************************/
/***        UART Definitions                                           ***/
/****************************************************************************/
#define UART_PORT_SLAVE E_AHI_UART_1
#define UART_BAUD_RATE_SLAVE 19200


// includes
#include "ToCoNet.h"
#include "ToCoNet_mod_prototype.h"

#include "app_event.h"

/****************************************************************************/
/***        Macro Definitions                                             ***/
/****************************************************************************/
#define TX_NODELAY_AND_QUICK_BIT 1
#define TX_NODELAY 2
#define TX_NODELAY_AND_RESP_BIT 3
#define TX_SMALLDELAY 4
#define TX_REPONDING 5
#define LED_FLASH_MS 500
#define DEBUG_WD 0

/****************************************************************************/
/***        Type Definitions                                              ***/
/****************************************************************************/

/****************************************************************************/
/***        Local Function Prototypes                                     ***/
/****************************************************************************/
void vSerInitMessage();	// 起動メッセージ

// 初期化類
static void vInitHardware(int f_warm_start);
static void vSerialInit(uint32, tsUartOpt *);
static void vSerialInit2();
static void vProcessSerialParseCmd(TWESERCMD_tsSerCmd_Context *pSerCmd, int16 u16Byte);

void (* pvProcessSerialCmd)(TWESERCMD_tsSerCmd_Context*);	// 書式解釈後処理のコールバック関数

static void vReceiveNwkMsg(tsRxDataApp *);
static void vOutput_OpenClosePAL(tsRxPktInfo, uint8 *);

/****************************************************************************/
/***        Exported Variables                                            ***/
/****************************************************************************/

/****************************************************************************/
/***        Local Variables                                               ***/
/****************************************************************************/
tsAppData sAppData; //!< アプリケーションデータ  @ingroup MASTER

tsFILE sSerStream;
tsFILE sSerStream2;
PUBLIC TWE_tsFILE sSer;
PUBLIC TWE_tsFILE sSer2;
extern TWESTG_tsFinal sFinal;
extern const TWEINTRCT_tsFuncs asFuncs[];
TWEINTRCT_tsContext* sIntr;

TWESERCMD_tsSerCmd_Context sSerCmdIn; //!< シリアル入力用
TWESERCMD_tsSerCmd_Context sSerCmdOut; //!< シリアル出力

uint8 au8SerBuffTx[(SERCMD_MAXPAYLOAD + 32) * 2];

tsTimerContext sTimerApp; //!< タイマー管理構造体  @ingroup MASTER
tsTimerContext sTimerPWM; //!< タイマー管理構造体  @ingroup MASTER

uint8 au8SerOutBuff[SERCMD_MAXPAYLOAD + 32]; //!< シリアルの出力書式のための暫定バッファ  @ingroup MASTER

bool_t bColdStart = TRUE; //!< MoNoStickの時の起動時にLEDを光らせるためのフラグ @ingroup MASTER

void* pvProcessEv;
tsCbHandler* psCbHandler = NULL;
tsToCoNet_DupChk_Context* psDupChk = NULL;

/****************************************************************************/
/***        FUNCTIONS                                                     ***/
/****************************************************************************/
/** @ingroup MASTER
 * 電源投入時・リセット時に最初に実行される処理。本関数は２回呼び出される。初回は u32AHI_Init()前、
 * ２回目は AHI 初期化後である。
 *
 * - 各種初期化
 * - ToCoNet ネットワーク設定
 * - 設定値の計算
 * - ハードウェア初期化
 * - イベントマシンの登録
 * - 本関数終了後は登録したイベントマシン、および cbToCoNet_vMain() など各種コールバック関数が
 *   呼び出される。
 *
 * @param bStart TRUE:u32AHI_Init() 前の呼び出し FALSE: 後
 */
void cbAppColdStart(bool_t bStart) {
	if (!bStart) {
		// before AHI initialization (very first of code)
		// Module Registration
		ToCoNet_REG_MOD_ALL();
	} else {
		// メモリのクリア
		memset(&sAppData, 0x00, sizeof(sAppData));

		// LOAD configuration
		vAppLoadData( STGS_KIND_PARENT, TWESTG_SLOT_DEFAULT, FALSE );
		vQueryAppData();

		uint8 i;
		for(i=1;i<9;i++){
			vAppLoadData( STGS_KIND_PARENT, i, FALSE );
			vQueryAppData();
		}

		// デフォルトのネットワーク指定値
		sToCoNet_AppContext.u8TxMacRetry = 3; // MAC再送回数
		sToCoNet_AppContext.u32AppId = sAppData.u32appid; // アプリケーションID
		sToCoNet_AppContext.u32ChMask = sAppData.u32chmask; // 利用するチャネル群（最大３つまで）
		sToCoNet_AppContext.u8Channel = CHANNEL; // デフォルトのチャネル
		sToCoNet_AppContext.u16TickHz = 1000; // 1KHz 動作
		sToCoNet_AppContext.bRxOnIdle = TRUE;

		// 出力の設定
		sToCoNet_AppContext.u8TxPower = sAppData.u8pow;

		// 標準再送回数の計算
		uint8 u8retry = sAppData.u8retry;
		switch (u8retry) {
			case   0: sAppData.u8StandardTxRetry = 0x82; break;
			case 0xF: sAppData.u8StandardTxRetry = 0; break;
			default:  sAppData.u8StandardTxRetry = 0x80 + u8retry; break;
		}

		// ヘッダの１バイト識別子を AppID から計算
		sAppData.u8AppIdentifier = u8CCITT8( (uint8*) &sToCoNet_AppContext.u32AppId, 4 ); // APP ID の CRC8

		// version info
		sAppData.u32ToCoNetVersion = ToCoNet_u32GetVersion();

		// その他ハードウェアの初期化
		vInitHardware(FALSE);

		// ToCoStick の場合はデフォルトで親機に設定する
		bColdStart = TRUE;
		vPortSetLo(PORT_OUT1);
#ifndef USE_MONOSTICK
		vPortSetLo(PORT_OUT2);
#endif
		sTimerPWM.u16duty = 0;
		vTimerStart(&sTimerPWM);

		sAppData.u8Mode = E_IO_MODE_PARNET; // 親機のIO設定に強制する

		sAppData.u8AppLogicalId = 0;
		sAppData.u8Mode = 1; // 親機のモード番号

//		sAppData.u8DebugLevel = 5;

		// 各モード依存の初期値の設定など
		if (sAppData.u8layer) {
			sAppData.u8AppLogicalId = LOGICAL_ID_REPEATER;
			vInitAppRouter();
		}else{
			sAppData.u8AppLogicalId = LOGICAL_ID_PARENT;
			vInitAppParent();
		}

		// その他設定
		sAppData.u8max_hops = 3;

		
		// シリアルの書式出力のため
		if (IS_APPCONF_OPT_UART_BIN()) {
			TWESERCMD_Binary_vInit(&sSerCmdOut, au8SerOutBuff, 128); // バッファを指定せず初期化
			TWESERCMD_Binary_vInit(&sSerCmdIn, au8SerBuffTx, sizeof(au8SerBuffTx)); // バッファを指定せず初期化
		} else {
			TWESERCMD_Ascii_vInit(&sSerCmdOut, au8SerOutBuff, 128); // バッファを指定せず初期化
			TWESERCMD_Ascii_vInit(&sSerCmdIn, au8SerBuffTx, sizeof(au8SerBuffTx)); // バッファを指定せず初期化
		}

		sIntr = TWEINTRCT_pscInit(&sFinal, NULL, &sSer, vProcessSerialParseCmd, asFuncs);
		sIntr->config.u8screen_default = 1;	// インタラクティブモードでスタート

		// ショートアドレスの設定(決めうち)
		sToCoNet_AppContext.u16ShortAddress = SERCMD_ADDR_CONV_TO_SHORT_ADDR(sAppData.u8AppLogicalId);

		// MAC の初期化
		ToCoNet_vMacStart();

		// 主状態遷移マシンの登録
		if(pvProcessEv){
			ToCoNet_Event_Register_State_Machine(pvProcessEv);
		}
	}
}

/** @ingroup MASTER
 * スリープ復帰後に呼び出される関数。\n
 * 本関数も cbAppColdStart() と同様に２回呼び出され、u32AHI_Init() 前の
 * 初回呼び出しに於いて、スリープ復帰要因を判定している。u32AHI_Init() 関数は
 * これらのレジスタを初期化してしまう。
 *
 * - 変数の初期化（必要なもののみ）
 * - ハードウェアの初期化（スリープ後は基本的に再初期化が必要）
 * - イベントマシンは登録済み。
 *
 * @param bStart TRUE:u32AHI_Init() 前の呼び出し FALSE: 後
 */
void cbAppWarmStart(bool_t bStart) {
	cbAppColdStart(bStart);
}

/** @ingroup MASTER
 * 本関数は ToCoNet のメインループ内で必ず１回は呼び出される。
 * ToCoNet のメインループでは、CPU DOZE 命令を発行しているため、割り込みなどが発生した時に
 * 呼び出されるが、処理が無い時には呼び出されない。
 * しかし TICK TIMER の割り込みは定期的に発生しているため、定期処理としても使用可能である。
 *
 * - シリアルの入力チェック
 */
void cbToCoNet_vMain(void) {
	TWEINTRCT_vHandleSerialInput();

	if (psCbHandler && psCbHandler->pf_cbToCoNet_vMain) {
		(*psCbHandler->pf_cbToCoNet_vMain)();
	}
}


/** @ingroup MASTER
 * パケットの受信完了時に呼び出されるコールバック関数。\n
 * @param psRx 受信パケット
 */
void cbToCoNet_vRxEvent(tsRxDataApp *psRx) {
  if (psCbHandler && psCbHandler->pf_cbToCoNet_vRxEvent) {
    (*psCbHandler->pf_cbToCoNet_vRxEvent)(psRx);
  }

  // インタラクティブモードだったら何もしない
  if (TWEINTRCT_bIsVerbose()) {
    return;
  }

  // 暗号化対応時に平文パケットは受信しない
  if (IS_APPCONF_OPT_SECURE() && !IS_APPCONF_OPT_RCV_NOSECURE()) {
    if (!psRx->bSecurePkt) {
      return;
    }
  }

  // データパケット以外は無視する
  if(psRx->u8Cmd != TOCONET_PACKET_CMD_APP_DATA){
    return;
  }

  vReceiveNwkMsg(psRx);
}

/**
 * 子機または中継機を経由したデータを受信する。
 *
 * @param pRx 受信データ構造体
 */
static void vReceiveNwkMsg(tsRxDataApp *pRx) {
  tsRxPktInfo sRxPktInfo;

  uint8 *p = pRx->auData;

  uint8 u8b = G_OCTET();

  // PALからのパケット以外は無視する
  if (u8b & 0x80 != 1) {
    return;
  }

  // パケット経路を判別し，想定外パケットは無視する
  // T:端末 R:ルータ
  u8b = u8b&0x7F;
  if (u8b != 'T' && u8b != 'R'){
    return;
  }

  // パケット共通データの構築
  sRxPktInfo.u8lqi_1st = pRx->u8Lqi;
  sRxPktInfo.u32addr_1st = pRx->u32SrcAddr;
  sRxPktInfo.u32addr_rcvr = TOCONET_NWK_ADDR_PARENT;
  // ルータ経由の場合は元端末の情報に書き換える
  if (u8b == 'R') {
    sRxPktInfo.u32addr_1st = G_BE_DWORD();
    sRxPktInfo.u8lqi_1st = G_OCTET();
    sRxPktInfo.u32addr_rcvr = pRx->u32SrcAddr;
  }
  sRxPktInfo.u8id = G_OCTET();
  sRxPktInfo.u16fct = G_BE_WORD();
  sRxPktInfo.u8pkt = G_OCTET();

  vfPrintf(&sSerStream, "packet type %02x"LB, sRxPktInfo.u8pkt);

  // 開閉センサPALのデータの出力
  if (sRxPktInfo.u8pkt == 0x81) {
    vOutput_OpenClosePAL(sRxPktInfo, p);
  }
}

/**
 * 開閉センサPALのデータからフレームを構築しUART1に出力する
 *
 * @param sRxPktInfo 受信パケット情報
 * @param p 受信パケットのペイロード
 */
static void vOutput_OpenClosePAL(tsRxPktInfo sRxPktInfo, uint8 *p) {
  uint8 outbuf[32]; // 出力バッファ
  uint8* q = outbuf;

  // 送信元アドレス
  S_BE_DWORD(sRxPktInfo.u32addr_1st);
  vfPrintf(&sSerStream, "src address %04X"LB, sRxPktInfo.u32addr_1st);

  uint8 u8Length = G_OCTET();

  // 電源電圧
  _C{
    G_OCTET(); // sensor type
    G_OCTET(); // sensor type (extension)
    uint8 u8Pwr = G_OCTET();
    uint16 u16ADC = DECODE_VOLT(u8Pwr);
    S_BE_WORD(u16ADC);

    vfPrintf(&sSerStream, "power voltage %d"LB, u16ADC);
  }

  // ADC1
  _C{
    G_OCTET(); // sensor type
    G_OCTET(); // sensor type (extension)
    uint16 u16ADC = 0;
    u16ADC = G_BE_WORD();

    vfPrintf(&sSerStream, "ADC1 voltage %d"LB, u16ADC);
  }

  // 磁石
  _C{
    G_OCTET(); // sensor type
    G_OCTET(); // sensor type (extension)
    uint8 u8Status = G_OCTET();
    uint8 isPeriodic = (u8Status >> 4) > 0;
    u8Status &= 0x0F;
    S_OCTET(u8Status);
    S_OCTET(isPeriodic);

    vfPrintf(&sSerStream, "hellic status %d (periodic: %d)"LB, u8Status, isPeriodic);
  }

  uint16 bufLen = q - outbuf;
  uint16 i;
  // UART0にデバッグ出力
  for (i = 0; i<bufLen; i++) {
    vfPrintf(&sSerStream, "%02X ", outbuf[i]);
  }
  vfPrintf(&sSerStream, LB);

  // STX,ETXを前後につけてUART1に出力
  vPutChar(&sSerStream2, 0x02);
  for (i = 0; i<bufLen; i++) {
    vfPrintf(&sSerStream2, "%02X", outbuf[i]);
  }
  vPutChar(&sSerStream2, 0x03);
}

/** @ingroup MASTER
 * 送信完了時に呼び出されるコールバック関数。
 *
 * @param u8CbId 送信時に設定したコールバックID
 * @param bStatus 送信ステータス
 */
void cbToCoNet_vTxEvent(uint8 u8CbId, uint8 bStatus) {
	if (psCbHandler && psCbHandler->pf_cbToCoNet_vTxEvent) {
		(*psCbHandler->pf_cbToCoNet_vTxEvent)(u8CbId, bStatus);
	}

	return;
}

/** @ingroup MASTER
 * ネットワーク層などのイベントが通達される。\n
 * 本アプリケーションでは特別な処理は行っていない。
 *
 * @param ev
 * @param u32evarg
 */
void cbToCoNet_vNwkEvent(teEvent ev, uint32 u32evarg) {
	if (psCbHandler && psCbHandler->pf_cbToCoNet_vNwkEvent) {
		(*psCbHandler->pf_cbToCoNet_vNwkEvent)(ev, u32evarg);
	}
}

/** @ingroup MASTER
 * ハードウェア割り込み時に呼び出される。本処理は割り込みハンドラではなく、割り込みハンドラに登録された遅延実行部による処理で、長い処理が記述可能である。
 *
 * @param u32DeviceId
 * @param u32ItemBitmap
 */
void cbToCoNet_vHwEvent(uint32 u32DeviceId, uint32 u32ItemBitmap) {
	switch (u32DeviceId) {
	case E_AHI_DEVICE_SYSCTRL:
		break;

	case E_AHI_DEVICE_ANALOGUE: //ADC完了時にこのイベントが発生する。
		break;

	case E_AHI_DEVICE_TICK_TIMER: //比較的頻繁な処理
		_C{
#ifdef USE_MONOSTICK
			static bool_t bPulse = FALSE;
			vPortSet_TrueAsLo(WD_PULSE,  bPulse);
			bPulse = !bPulse;
#endif

			if( bColdStart && u32TickCount_ms >= LED_FLASH_MS ){
				bColdStart = FALSE;
				vPortSetHi(PORT_OUT1);
#ifndef USE_MONOSTICK
				vPortSetHi(PORT_OUT2);
#endif
				sTimerPWM.u16duty = 1024;
				vTimerStart(&sTimerPWM);
			}
		}
		break;

	case E_AHI_DEVICE_TIMER0:
		sAppData.u32CtTimer0++;
		break;

	default:
		break;
	}

	if (psCbHandler && psCbHandler->pf_cbToCoNet_vHwEvent) {
		(*psCbHandler->pf_cbToCoNet_vHwEvent)(u32DeviceId, u32ItemBitmap);
	}
}

/** @ingroup MASTER
 * 割り込みハンドラ。ここでは長い処理は記述してはいけない。
 *
 * - TICK_TIMER\n
 *   - ADCの実行管理
 *   - ボタン入力判定管理
 */
PUBLIC uint8 cbToCoNet_u8HwInt(uint32 u32DeviceId, uint32 u32ItemBitmap) {
	uint8 u8handled = FALSE;

	if (psCbHandler && psCbHandler->pf_cbToCoNet_u8HwInt) {
		u8handled = (*psCbHandler->pf_cbToCoNet_u8HwInt)(u32DeviceId, u32ItemBitmap);
	}

	return u8handled;
}

/** @ingroup MASTER
 * ハードウェアの初期化を行う。スリープ復帰時も原則同じ初期化手続きを行う。
 *
 * - 管理構造体のメモリ領域の初期化
 * - DO出力設定
 * - DI入力設定
 * - DI割り込み設定 (低レイテンシモード)
 * - M1-M3 の読み込み
 * - UARTの初期化
 * - ADC3/4 のプルアップ停止
 * - タイマー用の未使用ポートを汎用IOに解放する宣言
 * - 秒64回のTIMER0の初期化と稼働
 * - ADC/PWM の初期化
 * - I2Cの初期化
 *
 * @param f_warm_start TRUE:スリープ復帰時
 */
static void vInitHardware(int f_warm_start) {
	// メモリのクリア
	memset(&sTimerApp, 0, sizeof(tsTimerContext));
	memset(&sTimerPWM, 0, sizeof(tsTimerContext));

	vPortDisablePullup(PORT_OUT1);
	vPortSetHi(PORT_OUT1);
	vPortAsOutput(PORT_OUT1);

#ifdef USE_MONOSTICK
	vPortDisablePullup(WD_ENABLE);
	vPortSetLo(WD_ENABLE);
	vPortAsOutput(WD_ENABLE);

	vPortDisablePullup(WD_PULSE);
	vPortSetLo(WD_PULSE);
	vPortAsOutput(WD_PULSE);
#else
	vPortDisablePullup(PORT_OUT2);
	vPortSetHi(PORT_OUT2);
	vPortAsOutput(PORT_OUT2);
#endif

	vPortAsInput(PORT_BAUD);

	// UART 設定
	{

		tsUartOpt sUartOpt;
		memset(&sUartOpt, 0, sizeof(tsUartOpt));

		if(IS_APPCONF_OPT_UART_FORCE_SETTINGS() || bPortRead(PORT_BAUD)){
			sUartOpt.bHwFlowEnabled = FALSE;
			sUartOpt.bParityEnabled = UART_PARITY_ENABLE;
			sUartOpt.u8ParityType = UART_PARITY_TYPE;
			sUartOpt.u8StopBit = UART_STOPBITS;

			// 設定されている場合は、設定値を採用する
			switch(sAppData.u8parity & 0x03) {
			case 0:
				sUartOpt.bParityEnabled = FALSE;
				break;
			case 1:
				sUartOpt.bParityEnabled = TRUE;
				sUartOpt.u8ParityType = E_AHI_UART_ODD_PARITY;
				break;
			case 2:
				sUartOpt.bParityEnabled = TRUE;
				sUartOpt.u8ParityType = E_AHI_UART_EVEN_PARITY;
				break;
			}

			// ストップビット
			if (sAppData.u8parity & 0x04) {
				sUartOpt.u8StopBit = E_AHI_UART_2_STOP_BITS;
			} else {
				sUartOpt.u8StopBit = E_AHI_UART_1_STOP_BIT;
			}

			// 7bitモード
			if (sAppData.u8parity & 0x08) {
				sUartOpt.u8WordLen = 7;
			} else {
				sUartOpt.u8WordLen = 8;
			}

			vSerialInit(sAppData.u32baud, &sUartOpt);
		}else{
			vSerialInit(UART_BAUD, NULL);
		}
    vSerialInit2();
	}

	// タイマの未使用ポートの解放（汎用ＩＯとして使用するため）
	vAHI_TimerFineGrainDIOControl(0x7); // bit 0,1,2 をセット (TIMER0 の各ピンを解放する, PWM1..4 は使用する)

	// 秒64回のTIMER0の初期化と稼働
	sTimerApp.u8Device = E_AHI_DEVICE_TIMER0;
	sTimerApp.u16Hz = 64;
	sTimerApp.u8PreScale = 4; // 15625ct@2^4
	vTimerConfig(&sTimerApp);
	vTimerStart(&sTimerApp);

	// PWM
	uint16 u16pwm_duty_default = 1024; // 起動時のデフォルト
	uint16 u16PWM_Hz = 1000; // PWM周波数
	uint8 u8PWM_prescale = 0; // prescaleの設定
	if (u16PWM_Hz < 10)
		u8PWM_prescale = 9;
	else if (u16PWM_Hz < 100)
		u8PWM_prescale = 6;
	else if (u16PWM_Hz < 1000)
		u8PWM_prescale = 3;
	else
		u8PWM_prescale = 0;

	sTimerPWM.u16Hz = u16PWM_Hz;
	sTimerPWM.u8PreScale = u8PWM_prescale;
	sTimerPWM.u16duty = u16pwm_duty_default;
	sTimerPWM.bPWMout = TRUE;
	sTimerPWM.bDisableInt = TRUE; // 割り込みを禁止する指定

	vAHI_TimerSetLocation(E_AHI_TIMER_1, TRUE, TRUE); // DIO5, DO1, DO2, DIO8

#ifdef USE_MONOSTICK
	sTimerPWM.u8Device = E_AHI_DEVICE_TIMER3;
#else
	sTimerPWM.u8Device = E_AHI_DEVICE_TIMER1;
#endif

	vTimerConfig(&sTimerPWM);
	vTimerStart(&sTimerPWM);

}

/** @ingroup MASTER
 * UART を初期化する
 * @param u32Baud ボーレート
 */
void vSerialInit(uint32 u32Baud, tsUartOpt *pUartOpt) {
	/* Create the debug port transmit and receive queues */
	static uint8 au8SerialTxBuffer[2560];
	static uint8 au8SerialRxBuffer[2560];

	TWETERM_tsSerDefs sDef;

	sDef.au8RxBuf = au8SerialRxBuffer;
	sDef.au8TxBuf = au8SerialTxBuffer;

	sDef.u16RxBufLen = sizeof(au8SerialRxBuffer);
	sDef.u16TxBufLen = sizeof(au8SerialTxBuffer);
	sDef.u32Baud = u32Baud;

	TWETERM_vInitJen(&sSer, UART_PORT_MASTER, &sDef);

	sSerStream.u8Device = UART_PORT_MASTER;
	sSerStream.bPutChar = SERIAL_bTxChar;
	ToCoNet_vDebugInit(&sSerStream);
	ToCoNet_vDebugLevel(0);

}

void vSerialInit2() {
	/* Create the debug port transmit and receive queues */
	static uint8 au8Serial2TxBuffer[256];
	static uint8 au8Serial2RxBuffer[256];

	TWETERM_tsSerDefs sDef;

	sDef.au8RxBuf = au8Serial2RxBuffer;
	sDef.au8TxBuf = au8Serial2TxBuffer;

	sDef.u16RxBufLen = sizeof(au8Serial2RxBuffer);
	sDef.u16TxBufLen = sizeof(au8Serial2TxBuffer);
	sDef.u32Baud = UART_BAUD_RATE_SLAVE;

	TWETERM_vInitJen(&sSer2, UART_PORT_SLAVE, &sDef);

	/* static tsFILE sSerStream; */
	sSerStream2.u8Device = UART_PORT_SLAVE;
	sSerStream2.bPutChar = SERIAL_bTxChar;
	ToCoNet_vDebugInit(&sSerStream2);
}

/** @ingroup MASTER
 * 始動時メッセージの表示を行う。
 */
void vSerInitMessage() {
	TWE_fprintf(&sSer,
			LB"!INF MW APP_WINGS(%s) v%d-%02d-%d, SID=0x%08X"LB,
			sAppData.u8layer ? "Router" : "Parent", VERSION_MAIN, VERSION_SUB, VERSION_VAR, ToCoNet_u32GetSerial() );
}

static void vProcessSerialParseCmd(TWESERCMD_tsSerCmd_Context *pSerCmd, int16 u16Byte)
{
	uint8 u8res = sSerCmdIn.u8Parse( &sSerCmdIn, (uint8)u16Byte );

	if( u8res == E_TWESERCMD_COMPLETE ){
		pvProcessSerialCmd(&sSerCmdIn);
	}else{
		DBGOUT(3, "%c", (uint8)u16Byte);
	}
}

/****************************************************************************/
/***        END OF FILE                                                   ***/
/****************************************************************************/
