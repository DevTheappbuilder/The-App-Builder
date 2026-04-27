import logging
import os


def build_logger(name: str = 'escrow-bot') -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    level_name = os.getenv('LOG_LEVEL', 'INFO').upper()
    logger.setLevel(getattr(logging, level_name, logging.INFO))

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s :: %(message)s'))
    logger.addHandler(handler)

    return logger
