import os
import logging
import pandas as pd
from .utils import to_time_index, geometric_random_walk

logger = logging.getLogger(__name__)

def load_minute_data(data_dir='data', pair='EURUSD'):
    if not os.path.isdir(data_dir):
        logger.warning(f"Data dir '{data_dir}' not found, using synthetic data")
        df = geometric_random_walk()
        df['bid'] = df['mid'] * (1 - 0.00005)
        df['ask'] = df['mid'] * (1 + 0.00005)
        return df[['bid', 'ask', 'mid']]

    csvs = [f for f in os.listdir(data_dir) if f.lower().endswith('.csv')]
    if not csvs:
        logger.warning("No CSVs found, using synthetic data")
        df = geometric_random_walk()
        df['bid'] = df['mid'] * (1 - 0.00005)
        df['ask'] = df['mid'] * (1 + 0.00005)
        return df[['bid', 'ask', 'mid']]

    candidates = [pair.upper()+'.csv', pair.upper()+'_1m.csv', pair.lower()+'.csv', pair.lower()+'_1m.csv']
    path = None
    for c in candidates:
        if c in csvs:
            path = os.path.join(data_dir, c)
            break

    path = path or os.path.join(data_dir, csvs[0])
    logger.info(f"Loading {path}")
    df = pd.read_csv(path)

    if {'bid', 'ask'}.issubset(df.columns):
        df['mid'] = (df['bid'] + df['ask']) / 2.0
    elif 'mid' not in df.columns:
        raise ValueError('CSV must include bid+ask or mid column')

    if 'time' in df.columns:
        df = to_time_index(df, 'time')
    else:
        df.index = pd.to_datetime(df.iloc[:, 0], utc=True, errors='coerce')
        df = df.drop(columns=[df.columns[0]])
    return df[['bid', 'ask', 'mid']].sort_index()
