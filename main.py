import yaml
import logging
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from src.data_loader import load_minute_data
from src.scalper import generate_signals, backtest_minute
from src.walkforward import walk_forward
from src.utils import normalize_pair

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def load_cfg(path='configs/config.yaml'):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def run():
    try:
        cfg = load_cfg()
        pairs = cfg.get('pairs') or [cfg.get('pair','EURUSD')]
        outdir = Path(cfg.get('output_dir', '.'))
        outdir.mkdir(parents=True, exist_ok=True)
        initial_equity = cfg.get('initial_equity', 10000.0)

        logger.info(f"Starting forex scalper bot. Output directory: {outdir}")

        for pair in pairs:
            norm = normalize_pair(pair)
            logger.info(f"=== Running {norm} ===")
            try:
                df = load_minute_data('data', pair=norm)
                df = df.resample(f"{cfg['bar_minutes']}min").last().dropna()

                # In-sample
                tmp_cfg = {**cfg, 'pair': norm}
                aug, sig = generate_signals(df, tmp_cfg)
                rec, eq = backtest_minute(aug, sig, tmp_cfg, pair=norm, initial_equity=initial_equity)
                eq.plot(title=f'Equity Curve (In-Sample) - {norm}')
                plt.tight_layout()
                plt.savefig(outdir / f'equity_insample_{norm}.png', dpi=150)
                plt.close()
                logger.info(f"Saved in-sample equity chart for {norm}")

                # Walk-forward
                wf = walk_forward(aug, tmp_cfg)
                if not wf.empty:
                    wf['equity'] = initial_equity + wf['pnl'].cumsum()
                    wf['equity'].plot(title=f'Equity Curve (Walk-Forward OOS) - {norm}')
                    plt.tight_layout()
                    plt.savefig(outdir / f'equity_walkforward_{norm}.png', dpi=150)
                    plt.close()
                    wf.to_csv(outdir / f'walkforward_trades_{norm}.csv')
                    logger.info(f"Saved walk-forward results for {norm}")
                else:
                    logger.warning(f"No walk-forward results for {norm}")

                rec.to_csv(outdir / f'insample_trades_{norm}.csv')
                logger.info(f"Saved in-sample trades for {norm}")

            except Exception as e:
                logger.error(f"Error processing pair {norm}: {e}", exc_info=True)
                continue

        logger.info("Done. Per-pair artifacts written.")

    except Exception as e:
        logger.error(f"Fatal error in run(): {e}", exc_info=True)
        raise

if __name__ == '__main__':
    run()
