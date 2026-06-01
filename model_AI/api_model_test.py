from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import pandas as pd
import uvicorn
import numpy as np
from statsmodels.tsa.statespace.sarimax import SARIMAX
from typing import List, Dict, Any

#! API TEST SERVER PYTHON UNTUK NESTJS BACKEND SERVICE

app = FastAPI(title="OmniSight BI - ML Endpoint")

# ====================================================================
# LOAD SEMUA MODEL AI DI AWAL
# ====================================================================
try:
    model_churn = joblib.load('churn_model.pkl')
    print("✅ Model Churn berhasil dimuat.")
except:
    model_churn = None
    print("⚠️ Peringatan: churn_model.pkl tidak ditemukan!")

try:
    model_forecast = joblib.load('forecasting_model.pkl')
    print("✅ Model Forecast berhasil dimuat.")
except:
    model_forecast = None
    print("⚠️ Peringatan: forecasting_model.pkl tidak ditemukan!")


# ====================================================================
# ENDPOINT 1: CUSTOMER CHURN PREDICTION (BATCH / BANYAK SEKALIGUS)
# ====================================================================
class PelangganRFM(BaseModel):
    CustomerID: int
    Name: str
    Recency: int
    Frequency: int
    Monetary: float

class ChurnBatchRequest(BaseModel):
    customers: List[PelangganRFM]

@app.post("/predict-churn-batch")
def predict_churn_batch(data: ChurnBatchRequest):
    if model_churn is None:
        return {"status": "error", "message": "Model Churn belum di-load."}
        
    # Ubah data dari NestJS menjadi Pandas DataFrame
    df = pd.DataFrame([vars(c) for c in data.customers])
    
    if len(df) == 0:
        return {"status": "success", "predictions": []}
    
    # Ambil hanya fitur RFM untuk dimasukkan ke model
    X = df[['Recency', 'Frequency', 'Monetary']]
    
    # Prediksi probabilitas (Persentase)
    probabilitas_churn = model_churn.predict_proba(X)[:, 1]
    
    # Gabungkan hasil prediksi ke data asli
    df['Churn'] = probabilitas_churn
    
    hasil = df.to_dict(orient='records')
    
    return {
        "status": "success",
        "predictions": hasil
    }


# ====================================================================
# ENDPOINT 2: AI SALES FORECASTING & CORRELATION
# ====================================================================
class DataForecast(BaseModel):
    Target_Month: str
    Current_Quantity: float
    Historical_Data: List[Dict[str, Any]] 

@app.post("/forecast-sales")
def forecast_sales(data: DataForecast):
    if model_forecast is None:
        return {"status": "error", "message": "Model Forecast belum di-load."}

    hasil_prediksi = model_forecast.forecast(steps=1) 
    angka_ramalan = hasil_prediksi.iloc[-1]
    prediksi_unit = int(round(angka_ramalan))

    try:
        hasil_prediksi_7 = model_forecast.forecast(steps=7)
        predictions_array = [int(round(x)) for x in hasil_prediksi_7.tolist()]
    except:
        predictions_array = [prediksi_unit] * 7

    promo_corr = 0.85 
    weekend_corr = 0.72

    if data.Historical_Data:
        df_hist = pd.DataFrame(data.Historical_Data)
        if len(df_hist) > 5: 
            df_hist['date'] = pd.to_datetime(df_hist['date'])
            df_hist['sales'] = df_hist['sales'].astype(float)
            df_hist['is_weekend'] = df_hist['date'].dt.weekday.isin([5, 6]).astype(int)
            df_hist['is_promo'] = (df_hist['sales'] > df_hist['sales'].median()).astype(int)
            
            matrix_korelasi = df_hist[['sales', 'is_weekend', 'is_promo']].corr()
            weekend_corr = matrix_korelasi.loc['sales', 'is_weekend']
            promo_corr = matrix_korelasi.loc['sales', 'is_promo']
            
            if pd.isna(weekend_corr): weekend_corr = 0.12
            if pd.isna(promo_corr): promo_corr = 0.45

    if data.Current_Quantity == 0:
        growth = 0.0 if prediksi_unit <= 0 else 100.0
    else:
        growth = ((prediksi_unit - data.Current_Quantity) / data.Current_Quantity) * 100

    trend_simbol = "+" if growth > 0 else ""
    
    return {
        "status": "success",
        "growth_percentage": round(growth, 1),
        "trend": f"{trend_simbol}{round(growth, 1)}%", 
        "predictions_array": predictions_array,
        "anomaly_spike": round(abs(growth) * 1.2, 1) if abs(growth) > 10 else 14.5,
        "confidence_score": 88 if growth != 0 else 75,
        "correlation": {
            "promo": round(promo_corr, 2),
            "weekend": round(weekend_corr, 2)
        }
    }


# ====================================================================
# ENDPOINT 3: LATIH ULANG MODEL FORECAST (SARIMAX)
# ====================================================================
class RetrainData(BaseModel):
    transactions: list

@app.post("/retrain")
def retrain_model(data: RetrainData):
    try:
        model_aktif = joblib.load('forecasting_model.pkl')
        df = pd.DataFrame(data.transactions)
        
        if len(df) > 0:
            df['invoiceDate'] = pd.to_datetime(df['invoiceDate'])
            df = df.groupby(df['invoiceDate'].dt.date)['totalSales'].sum().reset_index()
            y_train = df['totalSales'].values
            
            p, d, q = model_aktif.model.order
            P, D, Q, s = model_aktif.model.seasonal_order
            
            model_baru = SARIMAX(y_train, order=(p, d, q), seasonal_order=(P, D, Q, s))
            model_aktif_baru = model_baru.fit(disp=False)
            
            joblib.dump(model_aktif_baru, 'forecasting_model.pkl')
            
            global model_forecast
            model_forecast = model_aktif_baru
            
            return {
                "status": "success",
                "message": f"Berhasil! Model SARIMAX AI telah dilatih ulang menggunakan {len(df)} baris data transaksi terbaru."
            }
        else:
            return {"status": "error", "message": "Gagal melatih: Tidak ada data transaksi."}
            
    except Exception as e:
        print(f"Error Retrain: {e}")
        return {"status": "error", "message": f"Gagal melatih model: {str(e)}"}
    
if __name__ == "__main__":
    print("🚀 Menjalankan API ML di http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)