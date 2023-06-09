#include "xz-decompress.h"

static int has_initialized = 0;

DecompressionContext* create_context() {
    if (!has_initialized) {
        has_initialized = 1;
        xz_crc32_init();
        xz_crc64_init();
    }

    DecompressionContext* context = malloc(sizeof(DecompressionContext));
    context->bufsize = BUFSIZE;
    context->s = xz_dec_init(XZ_DYNALLOC, 1 << 26);

    struct xz_buf *b = &context->b;
    b->in = context->in;
    b->in_pos = 0;
    b->in_size = 0;
    b->out = context->out;
    b->out_pos = 0;
    b->out_size = BUFSIZE;

    return context;
}

void destroy_context(DecompressionContext* context) {
    xz_dec_end(context->s);
    free(context);
}

void supply_input(DecompressionContext* context, size_t in_size) {
    struct xz_buf *b = &context->b;
    b->in_pos = 0;
    b->in_size = in_size;
}

enum xz_ret get_next_output(DecompressionContext* context) {
    struct xz_buf *b = &context->b;
    enum xz_ret ret = xz_dec_catrun(context->s, b, b->in_size == 0);
    return ret;
}
