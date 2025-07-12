"""
This module contains the logger implementation.
"""
import logging
from logging.handlers import TimedRotatingFileHandler
import os

from settings import BASE_DIR

import traceback

def format_exception_info(
    e: Exception,
    include_code: bool = True,
    full_traceback: bool = False
) -> str:
    """
    Formats an exception message with optional traceback details.

    Args:
        e (Exception): The exception object.
        include_code (bool): Whether to include the actual line of code.
        full_traceback (bool): If True, return the full traceback instead of a short info.

    Returns:
        str: Enhanced exception message.
    """
    try:
        tb = e.__traceback__
        if not tb:
            return str(e)

        if full_traceback:
            return ''.join(traceback.format_exception(type(e), e, tb)).strip()

        last_frame = traceback.extract_tb(tb)[-1]
        filename = last_frame.filename
        lineno = last_frame.lineno
        code_line = last_frame.line.strip() if last_frame.line and include_code else ""

        location_info = f"In file '{filename}\nIn line {lineno}"
        if include_code and code_line:
            location_info += f": {code_line}"
        
        return f"{location_info}\n{type(e).__name__}: {str(e)} "

    except Exception as formatting_error:
        return f"{str(e)} (could not extract traceback details: {formatting_error})"

def Logger() -> logging.Logger:
    logger_folder_path = os.path.join(BASE_DIR, "appRepo", "LOGGER")
    assert os.path.exists(logger_folder_path), f"{logger_folder_path} doesn't exist and is required by logger"
    logger = logging.getLogger()
    if len(logger.handlers) == 0:
        logger.setLevel(logging.INFO)
        # create time rotating file handler which logs messages
        if not os.path.exists(os.path.join(logger_folder_path, "system_logs")):
            os.mkdir(os.path.join(logger_folder_path, "system_logs"))
        fh = TimedRotatingFileHandler(
            os.path.join(logger_folder_path, "system_logs", "system.log"), 
            when='midnight', 
            interval=1, 
            backupCount=31, 
            encoding='utf-8'
        )
        fh.setLevel(logging.INFO)
        # create formatter and add it to the handlers
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(filename)s::%(funcName)s::%(lineno)d:\n%(message)s')
        fh.setFormatter(formatter)
        # add the handlers to the logger
        logger.addHandler(fh)
    return logger